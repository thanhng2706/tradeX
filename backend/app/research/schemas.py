from pydantic import BaseModel


class StockInfo(BaseModel):
    symbol: str
    name: str
    sector: str | None
    industry: str | None
    description: str | None
    exchange: str | None
    currency: str | None

    price: float | None
    previous_close: float | None
    change_pct: float | None
    day_high: float | None
    day_low: float | None
    fifty_two_week_high: float | None
    fifty_two_week_low: float | None

    market_cap: float | None
    pe_ratio: float | None
    forward_pe: float | None
    ps_ratio: float | None
    price_to_book: float | None
    dividend_yield: float | None
    eps: float | None
    forward_eps: float | None
    revenue: float | None
    gross_profit: float | None
    ebitda: float | None
    free_cash_flow: float | None
    total_debt: float | None
    total_cash: float | None
    enterprise_value: float | None
    beta: float | None
    avg_volume: float | None
    shares_outstanding: float | None


class ChartPoint(BaseModel):
    date: str
    close: float


class ScreenerResult(BaseModel):
    symbol: str
    name: str
    sector: str | None
    industry: str | None
    price: float | None
    currency: str | None
    market_cap: float | None
    pe_ratio: float | None
    revenue: float | None
    free_cash_flow: float | None


class FinancialsRow(BaseModel):
    period: str
    revenue: float | None
    gross_profit: float | None
    operating_income: float | None
    net_income: float | None
    ebitda: float | None
    total_assets: float | None
    total_liabilities: float | None
    free_cash_flow: float | None
