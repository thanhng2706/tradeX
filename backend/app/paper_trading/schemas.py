from datetime import date, datetime
from pydantic import BaseModel


class PaperTradeResponse(BaseModel):
    id: int
    strategy_id: int
    started_at: date
    status: str
    health_score: int | None
    health_report: str | None
    health_checked_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaperStatusResponse(BaseModel):
    paper_trade: PaperTradeResponse
    total_return_pct: float
    final_balance: float
    starting_balance: float
    num_trades: int
    win_rate: float
    sharpe_ratio: float
    max_drawdown_pct: float
    current_position: str
    last_buy_price: float
    current_price: float
    unrealized_pct: float
    recent_trades: list[dict]
    equity_curve: list[dict]
    events: list[dict] = []
    days_active: int
    error: str | None = None
