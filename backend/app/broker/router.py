from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, BrokerConnection, BrokerDeployment, BrokerOrder, BrokerEvent, Strategy, Portfolio
from app.auth.router import get_current_user
from app.broker.schemas import (
    BrokerConnectRequest,
    BrokerStatusResponse,
    BrokerOverviewResponse,
    BrokerDeploymentSummary,
    BrokerOrderSummary,
    BrokerClosePositionsResponse,
    ClosedPosition,
    ClosePositionError,
)
from app.broker.alpaca_client import get_account, list_positions, submit_order, AlpacaAuthError
from app.broker.crypto import encrypt, decrypt
from app.broker.scheduler import MAX_TOTAL_EXPOSURE_PCT

router = APIRouter(prefix="/broker", tags=["broker"])


def _exposure(api_key: str, api_secret: str, is_paper: bool, equity: float) -> tuple[float, float | None]:
    """Returns (total_exposure_usd, total_exposure_pct) given already-fetched account equity."""
    positions = list_positions(api_key, api_secret, is_paper)
    total_exposure = sum(abs(float(p.get("market_value", 0))) for p in positions)
    pct = (total_exposure / equity * 100) if equity else None
    return total_exposure, pct


@router.post("/connect", response_model=BrokerStatusResponse)
def connect_broker(
    body: BrokerConnectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        account = get_account(body.api_key, body.api_secret, body.is_paper)
    except AlpacaAuthError:
        raise HTTPException(status_code=400, detail="Alpaca rejected these API credentials")
    except Exception:
        raise HTTPException(status_code=502, detail="Could not reach Alpaca — try again")

    conn = db.query(BrokerConnection).filter(BrokerConnection.user_id == current_user.id).first()
    if not conn:
        conn = BrokerConnection(user_id=current_user.id)
        db.add(conn)

    conn.broker = "alpaca"
    conn.api_key_encrypted = encrypt(body.api_key)
    conn.api_secret_encrypted = encrypt(body.api_secret)
    conn.is_paper = body.is_paper
    conn.alpaca_account_id = account.get("id")
    conn.alpaca_account_number = account.get("account_number")
    conn.connected_at = datetime.utcnow()
    db.commit()
    db.refresh(conn)

    total_exposure_usd, total_exposure_pct = _exposure(body.api_key, body.api_secret, body.is_paper, float(account.get("equity", 0)))

    return BrokerStatusResponse(
        connected=True,
        broker=conn.broker,
        is_paper=conn.is_paper,
        alpaca_account_number=conn.alpaca_account_number,
        buying_power=float(account.get("buying_power", 0)),
        cash=float(account.get("cash", 0)),
        connected_at=conn.connected_at,
        kill_switch_active=conn.kill_switch_active,
        kill_switch_activated_at=conn.kill_switch_activated_at,
        total_exposure_usd=total_exposure_usd,
        total_exposure_pct=total_exposure_pct,
        max_total_exposure_pct=MAX_TOTAL_EXPOSURE_PCT,
    )


@router.get("/status", response_model=BrokerStatusResponse)
def broker_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn = db.query(BrokerConnection).filter(BrokerConnection.user_id == current_user.id).first()
    if not conn:
        return BrokerStatusResponse(connected=False)

    try:
        api_key = decrypt(conn.api_key_encrypted)
        api_secret = decrypt(conn.api_secret_encrypted)
        account = get_account(api_key, api_secret, conn.is_paper)
    except Exception:
        return BrokerStatusResponse(
            connected=True,
            broker=conn.broker,
            is_paper=conn.is_paper,
            alpaca_account_number=conn.alpaca_account_number,
            connected_at=conn.connected_at,
            credentials_valid=False,
            kill_switch_active=conn.kill_switch_active,
            kill_switch_activated_at=conn.kill_switch_activated_at,
        )

    total_exposure_usd, total_exposure_pct = _exposure(api_key, api_secret, conn.is_paper, float(account.get("equity", 0)))

    return BrokerStatusResponse(
        connected=True,
        broker=conn.broker,
        is_paper=conn.is_paper,
        alpaca_account_number=conn.alpaca_account_number,
        buying_power=float(account.get("buying_power", 0)),
        cash=float(account.get("cash", 0)),
        connected_at=conn.connected_at,
        kill_switch_active=conn.kill_switch_active,
        kill_switch_activated_at=conn.kill_switch_activated_at,
        total_exposure_usd=total_exposure_usd,
        total_exposure_pct=total_exposure_pct,
        max_total_exposure_pct=MAX_TOTAL_EXPOSURE_PCT,
    )


@router.get("/overview", response_model=BrokerOverviewResponse)
def broker_overview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    deployments = (
        db.query(BrokerDeployment)
        .join(Strategy, BrokerDeployment.strategy_id == Strategy.id)
        .join(Portfolio, Strategy.portfolio_id == Portfolio.id)
        .filter(Portfolio.user_id == current_user.id)
        .order_by(BrokerDeployment.started_at.desc())
        .all()
    )

    deployment_summaries = [
        BrokerDeploymentSummary(
            id=d.id,
            strategy_id=d.strategy_id,
            strategy_name=d.strategy.name,
            ticker=d.strategy.ticker,
            portfolio_id=d.strategy.portfolio_id,
            status=d.status,
            started_at=d.started_at,
            last_tick_at=d.last_tick_at,
            last_error=d.last_error,
            consecutive_failures=d.consecutive_failures,
        )
        for d in deployments
    ]

    orders_summary = []
    if deployments:
        by_deployment = {d.id: d for d in deployments}
        order_rows = (
            db.query(BrokerOrder)
            .filter(BrokerOrder.deployment_id.in_(by_deployment.keys()))
            .order_by(BrokerOrder.created_at.desc())
            .limit(100)
            .all()
        )
        orders_summary = [
            BrokerOrderSummary(
                id=o.id,
                deployment_id=o.deployment_id,
                strategy_name=by_deployment[o.deployment_id].strategy.name,
                ticker=by_deployment[o.deployment_id].strategy.ticker,
                side=o.side,
                qty=o.qty,
                order_type=o.order_type,
                status=o.status,
                filled_qty=o.filled_qty,
                filled_avg_price=o.filled_avg_price,
                trade_date=o.trade_date,
                created_at=o.created_at,
            )
            for o in order_rows
        ]

    return BrokerOverviewResponse(deployments=deployment_summaries, orders=orders_summary)


@router.post("/kill-switch", response_model=BrokerStatusResponse)
def activate_kill_switch(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn = db.query(BrokerConnection).filter(BrokerConnection.user_id == current_user.id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="No broker connection found")
    conn.kill_switch_active = True
    conn.kill_switch_activated_at = datetime.utcnow()
    db.commit()
    return broker_status(current_user, db)


@router.delete("/kill-switch", response_model=BrokerStatusResponse)
def deactivate_kill_switch(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn = db.query(BrokerConnection).filter(BrokerConnection.user_id == current_user.id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="No broker connection found")
    conn.kill_switch_active = False
    conn.kill_switch_activated_at = None
    db.commit()
    return broker_status(current_user, db)


@router.post("/close-all-positions", response_model=BrokerClosePositionsResponse)
def close_all_positions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn = db.query(BrokerConnection).filter(BrokerConnection.user_id == current_user.id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="No broker connection found")

    try:
        api_key = decrypt(conn.api_key_encrypted)
        api_secret = decrypt(conn.api_secret_encrypted)
        positions = list_positions(api_key, api_secret, conn.is_paper)
    except AlpacaAuthError:
        raise HTTPException(status_code=400, detail="Alpaca rejected stored credentials")

    closed: list[ClosedPosition] = []
    errors: list[ClosePositionError] = []
    today = date.today()

    for position in positions:
        symbol = position.get("symbol")
        qty = abs(float(position.get("qty", 0)))
        if not symbol or qty <= 0:
            continue
        try:
            order = submit_order(api_key, api_secret, conn.is_paper, symbol, qty, "SELL")
        except Exception as e:
            errors.append(ClosePositionError(symbol=symbol, error=str(e)))
            continue

        closed.append(ClosedPosition(symbol=symbol, qty=qty, order_id=order.get("id"), status=order.get("status")))

        deployment = (
            db.query(BrokerDeployment)
            .join(Strategy, BrokerDeployment.strategy_id == Strategy.id)
            .join(Portfolio, Strategy.portfolio_id == Portfolio.id)
            .filter(Portfolio.user_id == current_user.id, Strategy.ticker == symbol)
            .first()
        )
        if deployment:
            already_logged = (
                db.query(BrokerOrder)
                .filter(BrokerOrder.deployment_id == deployment.id, BrokerOrder.trade_date == today, BrokerOrder.side == "SELL")
                .first()
            )
            if not already_logged:
                db.add(BrokerOrder(
                    deployment_id=deployment.id,
                    alpaca_order_id=order.get("id"),
                    side="SELL",
                    qty=qty,
                    order_type="market",
                    status=order.get("status"),
                    trade_date=today,
                ))
            db.add(BrokerEvent(
                deployment_id=deployment.id,
                date=str(today),
                type="POSITION_CLOSED",
                message=f"Force-closed {qty:.4f} shares of {symbol} via Close All Positions",
            ))

    db.commit()
    return BrokerClosePositionsResponse(closed=closed, errors=errors)


@router.delete("/disconnect")
def disconnect_broker(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn = db.query(BrokerConnection).filter(BrokerConnection.user_id == current_user.id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="No broker connection found")

    active_deployments = (
        db.query(BrokerDeployment)
        .join(Strategy, BrokerDeployment.strategy_id == Strategy.id)
        .join(Portfolio, Strategy.portfolio_id == Portfolio.id)
        .filter(Portfolio.user_id == current_user.id, BrokerDeployment.status == "active")
        .all()
    )
    for deployment in active_deployments:
        deployment.status = "error"
        deployment.last_error = "Broker disconnected"

    db.delete(conn)
    db.commit()
    return {"status": "disconnected"}
