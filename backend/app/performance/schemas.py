from typing import Literal
from pydantic import BaseModel


class StrategyPerformance(BaseModel):
    strategy_id: int
    strategy_name: str
    ticker: str
    portfolio_id: int
    portfolio_name: str
    asset_type: str
    source: Literal["live", "backtest", "none"]
    total_pnl_usd: float | None
    total_return_pct: float | None
    num_trades: int
    win_rate: float | None
    live_fill_count: int
    equity_curve: list[dict]


class PerformanceSummary(BaseModel):
    strategies: list[StrategyPerformance]
    live_pnl_usd: float
    live_strategy_count: int
    backtest_pnl_pct_avg: float | None
    backtest_strategy_count: int
