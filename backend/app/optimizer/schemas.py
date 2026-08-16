from datetime import date
from pydantic import BaseModel


class OptimizeRequest(BaseModel):
    start_date: date
    end_date: date


class OptimizedResult(BaseModel):
    rank: int
    buy_conditions: dict
    sell_conditions: dict
    position_size_pct: float
    total_return_pct: float
    annualized_return_pct: float
    sharpe_ratio: float
    max_drawdown_pct: float
    win_rate: float
    num_trades: int
    final_balance: float
    # Same metrics, but computed on a held-out date range the genetic algorithm never
    # searched against — a result that only looks good on total_return_pct/sharpe_ratio
    # above but falls apart here was likely overfit to the training window's coincidences.
    validation_total_return_pct: float | None = None
    validation_annualized_return_pct: float | None = None
    validation_sharpe_ratio: float | None = None
    validation_max_drawdown_pct: float | None = None
    validation_win_rate: float | None = None
    validation_num_trades: int | None = None
    # One-line AI verdict comparing this result's training vs. validation performance.
    ai_verdict: str | None = None


class OptimizeResponse(BaseModel):
    strategy_id: int
    ticker: str
    starting_balance: float
    train_start: date
    train_end: date
    validation_start: date
    validation_end: date
    results: list[OptimizedResult]


class ApplyOptimizationRequest(BaseModel):
    buy_conditions: dict
    sell_conditions: dict
    position_size_pct: float
