import yfinance as yf
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.router import get_current_user
from app.models import User, Strategy, Portfolio, BrokerOrder, BacktestResult
from app.performance.schemas import StrategyPerformance, PerformanceSummary

router = APIRouter(prefix="/performance", tags=["performance"])


def _current_price(ticker: str) -> float | None:
    try:
        price = yf.Ticker(ticker).fast_info.last_price
        return float(price) if price else None
    except Exception:
        return None


def _compute_live_pnl(orders: list[BrokerOrder], current_price: float | None):
    """Walks filled orders chronologically for a single-position-at-a-time deployment,
    matching each SELL against the prior BUY's fill price to realize P&L, then marking
    any still-open position to a live current price for unrealized P&L."""
    open_qty = 0.0
    open_entry_price = 0.0
    realized_pnl = 0.0
    trades = 0
    wins = 0
    equity_curve: list[dict] = []

    for o in orders:
        qty = o.filled_qty if o.filled_qty is not None else o.qty
        price = o.filled_avg_price
        if price is None:
            continue

        if o.side == "BUY":
            if open_qty == 0:
                equity_curve.append({"date": str(o.trade_date), "value": round(realized_pnl, 2)})
                open_entry_price = price
            else:
                # Averaging into an existing position — blend cost basis by weighted average.
                open_entry_price = (open_entry_price * open_qty + price * qty) / (open_qty + qty)
            open_qty += qty
        elif o.side == "SELL" and open_qty > 0:
            closed_qty = min(qty, open_qty)
            pnl = (price - open_entry_price) * closed_qty
            realized_pnl += pnl
            trades += 1
            if pnl > 0:
                wins += 1
            open_qty = max(open_qty - qty, 0.0)
            equity_curve.append({"date": str(o.trade_date), "value": round(realized_pnl, 2)})

    total_pnl = realized_pnl
    if open_qty > 0 and current_price is not None:
        unrealized = (current_price - open_entry_price) * open_qty
        total_pnl = realized_pnl + unrealized
        equity_curve.append({"date": "now", "value": round(total_pnl, 2)})

    win_rate = (wins / trades * 100) if trades > 0 else None
    return total_pnl, trades, win_rate, equity_curve


@router.get("/summary", response_model=PerformanceSummary)
def performance_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    strategies = (
        db.query(Strategy)
        .join(Portfolio, Strategy.portfolio_id == Portfolio.id)
        .filter(Portfolio.user_id == current_user.id)
        .all()
    )

    results: list[StrategyPerformance] = []
    live_pnl_total = 0.0
    live_count = 0
    backtest_pct_sum = 0.0
    backtest_count = 0

    for s in strategies:
        deployment = s.broker_deployment
        filled_orders = []
        if deployment:
            filled_orders = (
                db.query(BrokerOrder)
                .filter(BrokerOrder.deployment_id == deployment.id, BrokerOrder.status == "filled")
                .order_by(BrokerOrder.trade_date.asc(), BrokerOrder.created_at.asc())
                .all()
            )

        if filled_orders:
            current_price = _current_price(s.ticker)
            pnl, num_trades, win_rate, equity_curve = _compute_live_pnl(filled_orders, current_price)
            results.append(StrategyPerformance(
                strategy_id=s.id, strategy_name=s.name, ticker=s.ticker,
                portfolio_id=s.portfolio_id, portfolio_name=s.portfolio.name,
                asset_type=s.asset_type, source="live",
                total_pnl_usd=round(pnl, 2), total_return_pct=None,
                num_trades=num_trades, win_rate=win_rate,
                live_fill_count=len(filled_orders), equity_curve=equity_curve,
            ))
            live_pnl_total += pnl
            live_count += 1
            continue

        latest_backtest = (
            db.query(BacktestResult)
            .filter(BacktestResult.strategy_id == s.id)
            .order_by(BacktestResult.created_at.desc())
            .first()
        )
        if latest_backtest:
            pnl = (
                latest_backtest.final_balance - latest_backtest.starting_balance
                if latest_backtest.final_balance is not None else None
            )
            results.append(StrategyPerformance(
                strategy_id=s.id, strategy_name=s.name, ticker=s.ticker,
                portfolio_id=s.portfolio_id, portfolio_name=s.portfolio.name,
                asset_type=s.asset_type, source="backtest",
                total_pnl_usd=round(pnl, 2) if pnl is not None else None,
                total_return_pct=latest_backtest.total_return_pct,
                num_trades=latest_backtest.num_trades or 0,
                win_rate=latest_backtest.win_rate,
                live_fill_count=0,
                equity_curve=latest_backtest.equity_curve or [],
            ))
            if latest_backtest.total_return_pct is not None:
                backtest_pct_sum += latest_backtest.total_return_pct
                backtest_count += 1
            continue

        results.append(StrategyPerformance(
            strategy_id=s.id, strategy_name=s.name, ticker=s.ticker,
            portfolio_id=s.portfolio_id, portfolio_name=s.portfolio.name,
            asset_type=s.asset_type, source="none",
            total_pnl_usd=None, total_return_pct=None,
            num_trades=0, win_rate=None, live_fill_count=0, equity_curve=[],
        ))

    order_key = {"live": 0, "backtest": 1, "none": 2}
    results.sort(key=lambda r: (order_key[r.source], -(r.total_pnl_usd if r.total_pnl_usd is not None else (r.total_return_pct if r.total_return_pct is not None else -1e9))))

    return PerformanceSummary(
        strategies=results,
        live_pnl_usd=round(live_pnl_total, 2),
        live_strategy_count=live_count,
        backtest_pnl_pct_avg=round(backtest_pct_sum / backtest_count, 2) if backtest_count else None,
        backtest_strategy_count=backtest_count,
    )
