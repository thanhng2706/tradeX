from datetime import date, datetime
from pydantic import BaseModel


class BrokerOrderResponse(BaseModel):
    id: int
    side: str
    qty: float
    order_type: str
    status: str | None
    filled_qty: float | None
    filled_avg_price: float | None
    trade_date: date
    created_at: datetime
    contract_symbol: str | None = None
    strike: float | None = None
    expiration: date | None = None
    option_type: str | None = None

    model_config = {"from_attributes": True}


class BrokerEventResponse(BaseModel):
    id: int
    date: str
    type: str
    message: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BrokerDeploymentResponse(BaseModel):
    id: int
    strategy_id: int
    status: str
    started_at: date
    last_tick_at: datetime | None
    last_error: str | None
    consecutive_failures: int
    created_at: datetime
    orders: list[BrokerOrderResponse]
    events: list[BrokerEventResponse]

    model_config = {"from_attributes": True}
