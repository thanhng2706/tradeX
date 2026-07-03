from datetime import datetime
from typing import Any
from pydantic import BaseModel


class ConditionSet(BaseModel):
    logic: str = "AND"
    rules: list[dict[str, Any]] = []


class StrategyCreate(BaseModel):
    name: str
    description: str = ""
    ticker: str
    buy_conditions: ConditionSet = ConditionSet()
    sell_conditions: ConditionSet = ConditionSet()
    position_size_pct: float = 10.0


class StrategyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    ticker: str | None = None
    buy_conditions: ConditionSet | None = None
    sell_conditions: ConditionSet | None = None
    position_size_pct: float | None = None


class StrategyResponse(BaseModel):
    id: int
    name: str
    description: str
    ticker: str
    buy_conditions: dict[str, Any]
    sell_conditions: dict[str, Any]
    position_size_pct: float
    created_at: datetime
    portfolio_id: int

    model_config = {"from_attributes": True}


class ParseNLRequest(BaseModel):
    text: str


class ParseNLResponse(BaseModel):
    name: str | None
    ticker: str | None
    buy_conditions: ConditionSet
    sell_conditions: ConditionSet
