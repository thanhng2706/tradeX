from datetime import datetime
from pydantic import BaseModel


class PortfolioCreate(BaseModel):
    name: str
    description: str = ""
    starting_balance: float = 10000.0


class PortfolioResponse(BaseModel):
    id: int
    name: str
    description: str
    starting_balance: float
    created_at: datetime

    model_config = {"from_attributes": True}
