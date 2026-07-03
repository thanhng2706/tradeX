from datetime import date, datetime
from typing import Any
from pydantic import BaseModel


class BacktestRequest(BaseModel):
    start_date: date
    end_date: date


class BacktestResultResponse(BaseModel):
    id: int
    strategy_id: int
    start_date: date
    end_date: date
    starting_balance: float
    final_balance: float
    total_return_pct: float
    annualized_return_pct: float
    sharpe_ratio: float
    max_drawdown_pct: float
    win_rate: float
    num_trades: int
    equity_curve: list[dict[str, Any]]
    trades: list[dict[str, Any]]
    events: list[dict[str, Any]] = []
    events_truncated: bool = False
    ai_explanation: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
