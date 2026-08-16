from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from anthropic import Anthropic

from app.config import settings
from app.database import get_db
from app.models import User, Strategy, Portfolio, BrokerDeployment, BrokerConnection
from app.auth.router import get_current_user
from app.backtesting.data import get_price_data
from app.backtesting.engine import evaluate_latest_signal_detail
from app.broker.crypto import decrypt
from app.broker.alpaca_client import get_position, AlpacaAuthError
from app.broker.live_schemas import (
    LiveStatusResponse, PricePoint, PositionInfo,
    LiveChatRequest, LiveChatResponse,
)

router = APIRouter(tags=["broker-live"])

LOOKBACK_DAYS = 400  # enough for any indicator period (e.g. SMA/EMA 200) to be non-NaN
CHART_DAYS = 90

_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


def _get_strategy(strategy_id: int, user: User, db: Session) -> Strategy:
    strategy = (
        db.query(Strategy)
        .join(Portfolio)
        .filter(Strategy.id == strategy_id, Portfolio.user_id == user.id)
        .first()
    )
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy


def _build_live_status(strategy: Strategy, db: Session) -> LiveStatusResponse:
    deployment = (
        db.query(BrokerDeployment)
        .filter(BrokerDeployment.strategy_id == strategy.id)
        .first()
    )
    if not deployment:
        raise HTTPException(
            status_code=400,
            detail="This strategy isn't deployed to Alpaca yet — deploy it first to open the Live Trading Terminal.",
        )

    today = date.today()
    lookback_start = today - timedelta(days=LOOKBACK_DAYS)
    df = get_price_data(strategy.ticker, lookback_start, today + timedelta(days=1), db)
    if df.empty:
        raise HTTPException(status_code=400, detail=f"No price data available for {strategy.ticker}")

    detail = evaluate_latest_signal_detail(strategy.buy_conditions, strategy.sell_conditions, df)

    chart_df = df[df["date"] >= (today - timedelta(days=CHART_DAYS))]
    price_series = [PricePoint(date=str(r["date"]), close=float(r["close"])) for _, r in chart_df.iterrows()]

    position = PositionInfo(in_position=False)
    conn = db.query(BrokerConnection).filter(BrokerConnection.user_id == strategy.portfolio.user_id).first()
    if conn:
        try:
            api_key = decrypt(conn.api_key_encrypted)
            api_secret = decrypt(conn.api_secret_encrypted)
            pos = get_position(api_key, api_secret, conn.is_paper, strategy.ticker)
            if pos:
                position = PositionInfo(
                    in_position=True,
                    qty=float(pos.get("qty", 0)),
                    avg_entry_price=float(pos.get("avg_entry_price", 0)),
                    current_price=float(pos.get("current_price", 0)) if pos.get("current_price") else None,
                    unrealized_pl=float(pos.get("unrealized_pl", 0)) if pos.get("unrealized_pl") is not None else None,
                )
        except AlpacaAuthError:
            pass
        except Exception:
            pass

    return LiveStatusResponse(
        strategy_id=strategy.id,
        strategy_name=strategy.name,
        ticker=strategy.ticker,
        deployment_status=deployment.status,
        started_at=deployment.started_at,
        last_tick_at=deployment.last_tick_at,
        last_error=deployment.last_error,
        price_series=price_series,
        orders=[
            {
                "id": o.id, "side": o.side, "qty": o.qty, "order_type": o.order_type,
                "status": o.status, "filled_qty": o.filled_qty, "filled_avg_price": o.filled_avg_price,
                "trade_date": str(o.trade_date), "created_at": o.created_at.isoformat(),
            }
            for o in deployment.orders
        ],
        events=[
            {"id": e.id, "date": e.date, "type": e.type, "message": e.message, "created_at": e.created_at.isoformat()}
            for e in deployment.events
        ],
        position=position,
        buy_rules=detail["buy_rules"],
        sell_rules=detail["sell_rules"],
        as_of_date=detail["date"],
    )


@router.get("/strategies/{strategy_id}/live-status", response_model=LiveStatusResponse)
def live_status(
    strategy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    strategy = _get_strategy(strategy_id, current_user, db)
    return _build_live_status(strategy, db)


def _format_rule(r: dict) -> str:
    right = r["right_indicator"] or "value"
    lv = "—" if r["left_value"] is None else round(r["left_value"], 2)
    rv = "—" if r["right_value"] is None else round(r["right_value"], 2)
    return f"{r['indicator']} ({lv}) {r['operator']} {right} ({rv}) → {'MET' if r['passed'] else 'not met'}"


@router.post("/strategies/{strategy_id}/live-chat", response_model=LiveChatResponse)
def live_chat(
    strategy_id: int,
    body: LiveChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    strategy = _get_strategy(strategy_id, current_user, db)
    status = _build_live_status(strategy, db)

    position_line = (
        f"Currently IN POSITION: {status.position.qty} shares of {status.ticker} @ avg ${status.position.avg_entry_price:.2f}, "
        f"unrealized P&L ${status.position.unrealized_pl:.2f}"
        if status.position.in_position
        else "Currently OUT of the market (no open position)."
    )
    recent_events = "\n".join(f"- {e['date']} {e['type']}: {e['message']}" for e in status.events[-10:]) or "None yet."
    buy_lines = "\n".join(f"- {_format_rule(r.model_dump())}" for r in status.buy_rules) or "No buy rules."
    sell_lines = "\n".join(f"- {_format_rule(r.model_dump())}" for r in status.sell_rules) or "No sell rules."

    system_prompt = f"""You are a live-trading narrator for the Tradex strategy "{status.strategy_name}" ({status.ticker}).

You ONLY narrate and answer questions about this strategy's real, current state. You NEVER decide, suggest placing,
or imply you can place a trade — the deployed rule engine and its safety guardrails (kill switch, exposure caps) are
the sole source of any real trading decision, always. If asked to trade or change the strategy, explain that's done
from the strategy editor or broker page, not here.

Current state as of {status.as_of_date}:
- Deployment status: {status.deployment_status}{f" (last error: {status.last_error})" if status.last_error else ""}
- Last tick: {status.last_tick_at or "never"}
- {position_line}

Buy conditions (current values vs thresholds):
{buy_lines}

Sell conditions (current values vs thresholds):
{sell_lines}

Recent events:
{recent_events}

Be concise, concrete, and reference the real numbers above. Do not invent data not shown here."""

    messages = [{"role": m.role, "content": m.content} for m in body.history]
    messages.append({"role": "user", "content": body.message})

    response = _get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=500,
        system=system_prompt,
        messages=messages,
    )
    text = "".join(block.text for block in response.content if block.type == "text")
    return LiveChatResponse(message=text)
