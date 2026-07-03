from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Strategy, Portfolio, BacktestResult
from app.backtesting.schemas import BacktestRequest, BacktestResultResponse
from app.backtesting.data import get_price_data
from app.backtesting.engine import run_backtest
from app.backtesting.explainer import explain_backtest
from app.auth.router import get_current_user

router = APIRouter(tags=["backtesting"])


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


@router.post("/strategies/{strategy_id}/backtest", response_model=BacktestResultResponse)
def run_backtest_endpoint(
    strategy_id: int,
    body: BacktestRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    strategy = _get_strategy(strategy_id, current_user, db)

    if body.start_date >= body.end_date:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")

    try:
        df = get_price_data(strategy.ticker, body.start_date, body.end_date, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if len(df) < 30:
        raise HTTPException(status_code=400, detail="Not enough price data for this date range (need at least 30 trading days)")

    results = run_backtest(
        buy_conditions=strategy.buy_conditions,
        sell_conditions=strategy.sell_conditions,
        df=df,
        starting_balance=strategy.portfolio.starting_balance,
        position_size_pct=strategy.position_size_pct,
    )

    try:
        explanation = explain_backtest(results, strategy.name)
    except Exception:
        explanation = None

    bt = BacktestResult(
        strategy_id=strategy_id,
        start_date=body.start_date,
        end_date=body.end_date,
        starting_balance=strategy.portfolio.starting_balance,
        final_balance=results["final_balance"],
        total_return_pct=results["total_return_pct"],
        annualized_return_pct=results["annualized_return_pct"],
        sharpe_ratio=results["sharpe_ratio"],
        max_drawdown_pct=results["max_drawdown_pct"],
        win_rate=results["win_rate"],
        num_trades=results["num_trades"],
        equity_curve=results["equity_curve"],
        trades=results["trades"],
        events=results["events"],
        events_truncated=results["events_truncated"],
        ai_explanation=explanation,
    )
    db.add(bt)
    db.commit()
    db.refresh(bt)
    return bt


@router.get("/strategies/{strategy_id}/backtests", response_model=list[BacktestResultResponse])
def list_backtests(
    strategy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_strategy(strategy_id, current_user, db)
    return (
        db.query(BacktestResult)
        .filter(BacktestResult.strategy_id == strategy_id)
        .order_by(BacktestResult.created_at.desc())
        .all()
    )


@router.get("/backtests/{backtest_id}", response_model=BacktestResultResponse)
def get_backtest(
    backtest_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bt = (
        db.query(BacktestResult)
        .join(Strategy)
        .join(Portfolio)
        .filter(BacktestResult.id == backtest_id, Portfolio.user_id == current_user.id)
        .first()
    )
    if not bt:
        raise HTTPException(status_code=404, detail="Backtest not found")
    return bt
