from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Strategy, Portfolio
from app.optimizer.schemas import OptimizeRequest, OptimizeResponse, OptimizedResult, ApplyOptimizationRequest
from app.optimizer.genetic import run_optimizer
from app.optimizer.verdict import generate_verdicts
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

    # Chronological 80/20 train/validation split — the genetic search only ever sees
    # train_df; validation_df is held out purely to catch results overfit to the
    # training window (great training numbers that don't hold up on unseen data).
    split_idx = int(len(df) * 0.8)
    train_df = df.iloc[:split_idx].reset_index(drop=True)
    validation_df = df.iloc[split_idx:].reset_index(drop=True)

    if len(train_df) < 30 or len(validation_df) < 30:
        raise HTTPException(
            status_code=400,
            detail="Date range too short to split into training and validation periods — "
                   "try a range with at least ~6 months of trading days.",
        )

    raw_results = run_optimizer(
        buy_conditions=strategy.buy_conditions,
        sell_conditions=strategy.sell_conditions,
        position_size_pct=strategy.position_size_pct,
        df=train_df,
        starting_balance=strategy.portfolio.starting_balance,
        validation_df=validation_df,
    )

    if not raw_results:
        raise HTTPException(status_code=400, detail="Optimizer found no valid configurations. Try a longer date range or looser conditions.")

    # The genetic search itself still selects/ranks candidates by TRAINING fitness
    # (unchanged) — but "Best Found" should mean "most trustworthy," not "best at
    # memorizing the training window," so re-order the final 5 for display by how
    # well they actually held up on validation. A result with zero validation trades
    # is always worse than one with real trades, regardless of its (near-zero) Sharpe.
    def _validation_rank_key(r: dict):
        trades = r.get("validation_num_trades") or 0
        sharpe = r.get("validation_sharpe_ratio")
        return (trades > 0, sharpe if sharpe is not None else float("-inf"))

    raw_results = sorted(raw_results, key=_validation_rank_key, reverse=True)

    try:
        verdicts = generate_verdicts(raw_results, strategy.name)
    except Exception:
        verdicts = [None] * len(raw_results)

    results = [
        OptimizedResult(rank=i + 1, ai_verdict=verdicts[i], **r)
        for i, r in enumerate(raw_results)
    ]

    return OptimizeResponse(
        strategy_id=strategy_id,
        ticker=strategy.ticker,
        starting_balance=strategy.portfolio.starting_balance,
        train_start=train_df["date"].iloc[0],
        train_end=train_df["date"].iloc[-1],
        validation_start=validation_df["date"].iloc[0],
        validation_end=validation_df["date"].iloc[-1],
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
