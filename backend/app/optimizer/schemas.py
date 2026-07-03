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


class OptimizeResponse(BaseModel):
    strategy_id: int
    ticker: str
    starting_balance: float
    results: list[OptimizedResult]


class ApplyOptimizationRequest(BaseModel):
    buy_conditions: dict
    sell_conditions: dict
    position_size_pct: float
