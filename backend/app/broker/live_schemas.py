from datetime import date, datetime
from pydantic import BaseModel


class PricePoint(BaseModel):
    date: str
    close: float


class RuleDetail(BaseModel):
    indicator: str
    params: dict
    operator: str
    right_indicator: str | None
    left_value: float | None
    right_value: float | None
    passed: bool


class PositionInfo(BaseModel):
    in_position: bool
    qty: float | None = None
    avg_entry_price: float | None = None
    current_price: float | None = None
    unrealized_pl: float | None = None


class LiveStatusResponse(BaseModel):
    strategy_id: int
    strategy_name: str
    ticker: str
    deployment_status: str
    started_at: date
    last_tick_at: datetime | None
    last_error: str | None
    price_series: list[PricePoint]
    orders: list  # BrokerOrderResponse-shaped dicts, reused as-is
    events: list  # BrokerEventResponse-shaped dicts, reused as-is
    position: PositionInfo
    buy_rules: list[RuleDetail]
    sell_rules: list[RuleDetail]
    as_of_date: str


class LiveChatMessage(BaseModel):
    role: str
    content: str


class LiveChatRequest(BaseModel):
    message: str
    history: list[LiveChatMessage] = []


class LiveChatResponse(BaseModel):
    message: str
