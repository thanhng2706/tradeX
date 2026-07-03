from datetime import datetime
from pydantic import BaseModel


class WatchlistAssetOut(BaseModel):
    id: int
    symbol: str
    added_at: datetime

    class Config:
        from_attributes = True


class WatchlistOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    assets: list[WatchlistAssetOut] = []

    class Config:
        from_attributes = True


class CreateWatchlistRequest(BaseModel):
    name: str


class AddAssetRequest(BaseModel):
    symbol: str


class AssetPrice(BaseModel):
    symbol: str
    price: float | None
    change_pct: float | None
    day_high: float | None
    day_low: float | None


class ChartPoint(BaseModel):
    date: str
    close: float
