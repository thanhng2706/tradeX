from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Strategy, Portfolio
from app.optimizer.schemas import OptimizeRequest, OptimizeResponse, OptimizedResult, ApplyOptimizationRequest
from app.optimizer.genetic import run_optimizer
from app.backtesting.data import get_price_data
from app.auth.router import get_current_user

router = APIRouter(tags=["optimizer"])


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


@router.post("/strategies/{strategy_id}/optimize", response_model=OptimizeResponse)
def optimize_strategy(
    strategy_id: int,
    body: OptimizeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    strategy = _get_strategy(strategy_id, current_user, db)

    if body.start_date >= body.end_date:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")

    buy_rules = strategy.buy_conditions.get("rules", [])
    sell_rules = strategy.sell_conditions.get("rules", [])
    if not buy_rules and not sell_rules:
        raise HTTPException(status_code=400, detail="Strategy has no conditions to optimize")

    try:
        df = get_price_data(strategy.ticker, body.start_date, body.end_date, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if len(df) < 30:
        raise HTTPException(status_code=400, detail="Not enough price data (need at least 30 trading days)")

    raw_results = run_optimizer(
        buy_conditions=strategy.buy_conditions,
        sell_conditions=strategy.sell_conditions,
        position_size_pct=strategy.position_size_pct,
        df=df,
        starting_balance=strategy.portfolio.starting_balance,
    )

    if not raw_results:
        raise HTTPException(status_code=400, detail="Optimizer found no valid configurations. Try a longer date range or looser conditions.")

    results = [OptimizedResult(rank=i + 1, **r) for i, r in enumerate(raw_results)]

    return OptimizeResponse(
        strategy_id=strategy_id,
        ticker=strategy.ticker,
        starting_balance=strategy.portfolio.starting_balance,
        results=results,
    )


@router.post("/strategies/{strategy_id}/optimize/apply")
def apply_optimization(
    strategy_id: int,
    body: ApplyOptimizationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    strategy = _get_strategy(strategy_id, current_user, db)
    strategy.buy_conditions = body.buy_conditions
    strategy.sell_conditions = body.sell_conditions
    strategy.position_size_pct = body.position_size_pct
    db.commit()
    return {"ok": True}
