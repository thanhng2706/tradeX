from datetime import date, datetime
from pydantic import BaseModel


class BrokerConnectRequest(BaseModel):
    api_key: str
    api_secret: str
    is_paper: bool = True


class BrokerStatusResponse(BaseModel):
    connected: bool
    broker: str | None = None
    is_paper: bool | None = None
    alpaca_account_number: str | None = None
    buying_power: float | None = None
    cash: float | None = None
    connected_at: datetime | None = None
    credentials_valid: bool = True
    kill_switch_active: bool = False
    kill_switch_activated_at: datetime | None = None
    total_exposure_usd: float | None = None
    total_exposure_pct: float | None = None
    max_total_exposure_pct: float | None = None


class BrokerDeploymentSummary(BaseModel):
    id: int
    strategy_id: int
    strategy_name: str
    ticker: str
    portfolio_id: int
    status: str
    started_at: date
    last_tick_at: datetime | None
    last_error: str | None
    consecutive_failures: int

    model_config = {"from_attributes": True}


class BrokerOrderSummary(BaseModel):
    id: int
    deployment_id: int
    strategy_name: str
    ticker: str
    side: str
    qty: float
    order_type: str
    status: str | None
    filled_qty: float | None
    filled_avg_price: float | None
    trade_date: date
    created_at: datetime

    model_config = {"from_attributes": True}


class BrokerOverviewResponse(BaseModel):
    deployments: list[BrokerDeploymentSummary]
    orders: list[BrokerOrderSummary]


class ClosedPosition(BaseModel):
    symbol: str
    qty: float
    order_id: str | None
    status: str | None


class ClosePositionError(BaseModel):
    symbol: str
    error: str


class BrokerClosePositionsResponse(BaseModel):
    closed: list[ClosedPosition]
    errors: list[ClosePositionError]


class NotificationItem(BaseModel):
    id: int
    deployment_id: int
    portfolio_id: int
    strategy_id: int
    strategy_name: str
    ticker: str
    type: str
    message: str
    created_at: datetime
    read: bool


class NotificationsResponse(BaseModel):
    unread_count: int
    items: list[NotificationItem]
