import json
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import yfinance as yf
from anthropic import Anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.research.schemas import StockInfo, ChartPoint, FinancialsRow, ScreenerResult
from app.research.screener_data import CATEGORIES

router = APIRouter(prefix="/research", tags=["research"])

VALID_PERIODS = {"1mo", "3mo", "6mo", "1y", "2y", "5y", "max"}

_anthropic: Anthropic | None = None


def _get_client() -> Anthropic:
    global _anthropic
    if _anthropic is None:
        _anthropic = Anthropic(api_key=settings.anthropic_api_key)
    return _anthropic


def _fetch_quote(symbol: str) -> dict:
    try:
        info = yf.Ticker(symbol).fast_info
        price = info.last_price
        prev = info.previous_close
        change_pct = ((price - prev) / prev * 100) if price and prev else None
        return {
            "symbol": symbol,
            "price": round(float(price), 2) if price is not None else None,
            "change_pct": round(float(change_pct), 2) if change_pct is not None else None,
            "currency": info.currency,
        }
    except Exception:
        return {"symbol": symbol, "price": None, "change_pct": None, "currency": None}


@router.get("/quotes")
def get_quotes(symbols: str):
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    with ThreadPoolExecutor(max_workers=8) as ex:
        return list(ex.map(_fetch_quote, syms))


@router.get("/stock/{symbol}", response_model=StockInfo)
def get_stock(symbol: str):
    symbol = symbol.upper()
    try:
        info = yf.Ticker(symbol).info
    except Exception:
        info = {}

    price = info.get("currentPrice") or info.get("regularMarketPrice")
    prev = info.get("previousClose")
    if price is None and prev is None:
        raise HTTPException(status_code=404, detail=f"Could not find ticker '{symbol}'")

    change_pct = ((price - prev) / prev * 100) if price and prev else None

    return StockInfo(
        symbol=symbol,
        name=info.get("longName") or info.get("shortName") or symbol,
        sector=info.get("sector"),
        industry=info.get("industry"),
        description=info.get("longBusinessSummary"),
        exchange=info.get("exchange"),
        currency=info.get("currency"),
        price=round(price, 2) if price is not None else None,
        previous_close=round(prev, 2) if prev is not None else None,
        change_pct=round(change_pct, 2) if change_pct is not None else None,
        day_high=info.get("dayHigh"),
        day_low=info.get("dayLow"),
        fifty_two_week_high=info.get("fiftyTwoWeekHigh"),
        fifty_two_week_low=info.get("fiftyTwoWeekLow"),
        market_cap=info.get("marketCap"),
        pe_ratio=info.get("trailingPE"),
        forward_pe=info.get("forwardPE"),
        ps_ratio=info.get("priceToSalesTrailing12Months"),
        price_to_book=info.get("priceToBook"),
        dividend_yield=info.get("dividendYield"),
        eps=info.get("trailingEps"),
        forward_eps=info.get("forwardEps"),
        revenue=info.get("totalRevenue"),
        gross_profit=info.get("grossProfits"),
        ebitda=info.get("ebitda"),
        free_cash_flow=info.get("freeCashflow"),
        total_debt=info.get("totalDebt"),
        total_cash=info.get("totalCash"),
        enterprise_value=info.get("enterpriseValue"),
        beta=info.get("beta"),
        avg_volume=info.get("averageVolume"),
        shares_outstanding=info.get("sharesOutstanding"),
    )


@router.get("/stock/{symbol}/history", response_model=list[ChartPoint])
def get_history(symbol: str, period: str = "3mo"):
    if period not in VALID_PERIODS:
        raise HTTPException(status_code=400, detail=f"period must be one of {sorted(VALID_PERIODS)}")
    try:
        hist = yf.Ticker(symbol.upper()).history(period=period)
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No data for {symbol}")
        if hist.index.tzinfo is not None:
            hist.index = hist.index.tz_localize(None)
        return [
            {"date": str(idx.date()), "close": round(float(row["Close"]), 2)}
            for idx, row in hist.iterrows()
        ]
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail=f"Could not fetch chart data for {symbol}")


def _row(df: pd.DataFrame, *names: str) -> dict:
    for name in names:
        if name in df.index:
            row = df.loc[name]
            return {str(col.date()): (None if pd.isna(v) else round(float(v), 2)) for col, v in row.items()}
    return {}


@router.get("/stock/{symbol}/financials", response_model=list[FinancialsRow])
def get_financials(symbol: str):
    t = yf.Ticker(symbol.upper())
    try:
        fin = t.financials
        bs = t.balance_sheet
        cf = t.cashflow
    except Exception:
        fin = pd.DataFrame()

    if fin.empty:
        raise HTTPException(status_code=404, detail=f"No financial data for {symbol}")

    revenue = _row(fin, "Total Revenue")
    gross_profit = _row(fin, "Gross Profit")
    operating_income = _row(fin, "Operating Income")
    net_income = _row(fin, "Net Income")
    ebitda = _row(fin, "EBITDA")
    total_assets = _row(bs, "Total Assets")
    total_liabilities = _row(bs, "Total Liabilities Net Minority Interest", "Total Liab")
    free_cash_flow = _row(cf, "Free Cash Flow")

    rows = []
    for col in fin.columns:
        key = str(col.date())
        rows.append(FinancialsRow(
            period=key,
            revenue=revenue.get(key),
            gross_profit=gross_profit.get(key),
            operating_income=operating_income.get(key),
            net_income=net_income.get(key),
            ebitda=ebitda.get(key),
            total_assets=total_assets.get(key),
            total_liabilities=total_liabilities.get(key),
            free_cash_flow=free_cash_flow.get(key),
        ))
    return rows


@router.post("/stock/{symbol}/report")
def generate_report(symbol: str):
    symbol = symbol.upper()
    try:
        info = yf.Ticker(symbol).info
    except Exception:
        info = {}

    if not info or (info.get("currentPrice") is None and info.get("regularMarketPrice") is None):
        raise HTTPException(status_code=404, detail=f"Could not find ticker '{symbol}'")

    currency = info.get('currency', 'USD')

    prompt = f"""You are a financial analyst writing an AI stock report for {info.get('longName', symbol)} ({symbol}).

Company data (all monetary values in {currency}):
- Sector / Industry: {info.get('sector', 'N/A')} / {info.get('industry', 'N/A')}
- Price: {info.get('currentPrice') or info.get('regularMarketPrice', 'N/A')} {currency}
- Market Cap: {info.get('marketCap', 'N/A')}
- PE Ratio (TTM): {info.get('trailingPE', 'N/A')}
- Forward PE: {info.get('forwardPE', 'N/A')}
- PS Ratio: {info.get('priceToSalesTrailing12Months', 'N/A')}
- Price/Book: {info.get('priceToBook', 'N/A')}
- EPS (TTM): {info.get('trailingEps', 'N/A')}
- Forward EPS: {info.get('forwardEps', 'N/A')}
- Revenue: {info.get('totalRevenue', 'N/A')}
- Gross Profit: {info.get('grossProfits', 'N/A')}
- EBITDA: {info.get('ebitda', 'N/A')}
- Free Cash Flow: {info.get('freeCashflow', 'N/A')}
- Total Debt: {info.get('totalDebt', 'N/A')}
- Total Cash: {info.get('totalCash', 'N/A')}
- Beta: {info.get('beta', 'N/A')}
- Dividend Yield: {info.get('dividendYield', 'N/A')}%
- 52-Week Range: {info.get('fiftyTwoWeekLow', 'N/A')} - {info.get('fiftyTwoWeekHigh', 'N/A')}

Business summary: {(info.get('longBusinessSummary') or 'N/A')[:600]}

Write a concise AI stock report in markdown with these sections (use ## headers):
## Financial Analysis
## Competitive Positioning
## Growth Drivers & Risks
## Valuation

Each section should be 2-4 sentences, data-driven, and reference the actual numbers above. Be direct and analytical, not generic. When citing monetary figures, use {currency} (not USD/$ unless the currency actually is USD). No preamble or disclaimer."""

    msg = _get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=900,
        messages=[{"role": "user", "content": prompt}],
    )
    return {"report": msg.content[0].text.strip()}


class ScreenerFilters(BaseModel):
    category: str | None = None
    min_market_cap: float | None = None
    max_market_cap: float | None = None
    min_pe: float | None = None
    max_pe: float | None = None
    min_revenue: float | None = None
    min_fcf: float | None = None


def _fetch_screen_info(symbol: str) -> dict | None:
    try:
        info = yf.Ticker(symbol).info
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        if price is None:
            return None
        return {
            "symbol": symbol,
            "name": info.get("longName") or info.get("shortName") or symbol,
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "price": round(float(price), 2),
            "currency": info.get("currency"),
            "market_cap": info.get("marketCap"),
            "pe_ratio": info.get("trailingPE"),
            "revenue": info.get("totalRevenue"),
            "free_cash_flow": info.get("freeCashflow"),
        }
    except Exception:
        return None


def _run_screen(filters: ScreenerFilters) -> list[dict]:
    if filters.category and filters.category in CATEGORIES:
        symbols = CATEGORIES[filters.category]
    else:
        symbols = sorted({s for lst in CATEGORIES.values() for s in lst})

    with ThreadPoolExecutor(max_workers=10) as ex:
        results = [r for r in ex.map(_fetch_screen_info, symbols) if r]

    def passes(r: dict) -> bool:
        if filters.min_market_cap is not None and (r["market_cap"] or 0) < filters.min_market_cap:
            return False
        if filters.max_market_cap is not None and (r["market_cap"] or float("inf")) > filters.max_market_cap:
            return False
        if filters.min_pe is not None and (r["pe_ratio"] or 0) < filters.min_pe:
            return False
        if filters.max_pe is not None and (r["pe_ratio"] or float("inf")) > filters.max_pe:
            return False
        if filters.min_revenue is not None and (r["revenue"] or 0) < filters.min_revenue:
            return False
        if filters.min_fcf is not None and (r["free_cash_flow"] or 0) < filters.min_fcf:
            return False
        return True

    filtered = [r for r in results if passes(r)]
    filtered.sort(key=lambda r: r["market_cap"] or 0, reverse=True)
    return filtered


@router.get("/screener/categories")
def get_categories():
    return list(CATEGORIES.keys())


@router.get("/screener", response_model=list[ScreenerResult])
def screen_stocks(
    category: str | None = None,
    min_market_cap: float | None = None,
    max_market_cap: float | None = None,
    min_pe: float | None = None,
    max_pe: float | None = None,
    min_revenue: float | None = None,
    min_fcf: float | None = None,
):
    filters = ScreenerFilters(
        category=category, min_market_cap=min_market_cap, max_market_cap=max_market_cap,
        min_pe=min_pe, max_pe=max_pe, min_revenue=min_revenue, min_fcf=min_fcf,
    )
    return _run_screen(filters)


@router.post("/screener/ai")
def ai_screen_stocks(body: dict):
    query = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    categories = list(CATEGORIES.keys())
    prompt = f"""Convert this stock screening request into JSON filter criteria.

Available categories (pick the closest match, or null if none fit): {categories}

Example: "profitable EV companies with PE under 30" ->
{{"category": "Electric Vehicles", "min_market_cap": null, "max_market_cap": null, "min_pe": null, "max_pe": 30, "min_revenue": null, "min_fcf": 1}}
("profitable" means min_fcf: 1 to exclude companies burning cash)

Example: "AI stocks worth over 1 trillion" ->
{{"category": "AI", "min_market_cap": 1000000000000, "max_market_cap": null, "min_pe": null, "max_pe": null, "min_revenue": null, "min_fcf": null}}

Now convert this request: "{query}"

Respond with ONLY a raw JSON object (no markdown fences, no explanation) with exactly these keys:
{{"category": string|null, "min_market_cap": number|null, "max_market_cap": number|null, "min_pe": number|null, "max_pe": number|null, "min_revenue": number|null, "min_fcf": number|null}}

Market cap/revenue/FCF are in raw dollars (e.g. 1000000000 for $1B)."""

    msg = _get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    text = msg.content[0].text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        parsed = json.loads(text)
        filters = ScreenerFilters(**{k: v for k, v in parsed.items() if k in ScreenerFilters.model_fields})
    except Exception:
        filters = ScreenerFilters()

    results = _run_screen(filters)
    return {"filters": filters.model_dump(), "results": results}


@router.post("/deep-dive")
def deep_dive(body: dict):
    topic = (body.get("topic") or "").strip()
    if not topic:
        raise HTTPException(status_code=400, detail="topic is required")

    symbol = (body.get("symbol") or "").strip().upper()
    context = ""
    if symbol:
        try:
            info = yf.Ticker(symbol).info
            if info.get("currentPrice") or info.get("regularMarketPrice"):
                currency = info.get("currency", "USD")
                context = f"""

Relevant company data for {symbol} ({info.get('longName', symbol)}), in {currency}:
- Sector / Industry: {info.get('sector', 'N/A')} / {info.get('industry', 'N/A')}
- Price: {info.get('currentPrice') or info.get('regularMarketPrice')}
- Market Cap: {info.get('marketCap', 'N/A')}
- PE Ratio: {info.get('trailingPE', 'N/A')}
- Revenue: {info.get('totalRevenue', 'N/A')}
- Free Cash Flow: {info.get('freeCashflow', 'N/A')}
- Beta: {info.get('beta', 'N/A')}"""
        except Exception:
            pass

    prompt = f"""You are Aria, an AI research analyst producing a Deep Dive report for a trader.

Research topic: "{topic}"{context}

Write an extensive, well-structured deep dive in markdown with these sections (use ## headers):
## Overview
## Key Data Points
## Market & Competitive Context
## Risks & Uncertainties
## Outlook

Each section should be 3-5 sentences, analytical and specific — cite concrete numbers, companies, or trends where relevant. This is a long-form research report, not a quick summary. No preamble, no disclaimers."""

    msg = _get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1600,
        messages=[{"role": "user", "content": prompt}],
    )
    return {"report": msg.content[0].text.strip()}
