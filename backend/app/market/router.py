from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Depends
from anthropic import Anthropic
import yfinance as yf

from app.config import settings
from app.auth.router import get_current_user
from app.models import User

router = APIRouter(prefix="/market", tags=["market"])

TICKERS = ["SPY", "BTC-USD", "ETH-USD", "MSFT", "META", "NVDA", "AAPL", "TSLA"]
DISPLAY  = {"BTC-USD": "BTC", "ETH-USD": "ETH"}

_anthropic: Anthropic | None = None

def _get_client() -> Anthropic:
    global _anthropic
    if _anthropic is None:
        _anthropic = Anthropic(api_key=settings.anthropic_api_key)
    return _anthropic


def _fetch_ticker(symbol: str) -> dict:
    try:
        info  = yf.Ticker(symbol).fast_info
        price = info.last_price
        prev  = info.previous_close
        change     = (price - prev) if price and prev else 0.0
        change_pct = (change / prev * 100) if prev else 0.0
        return {
            "symbol":     DISPLAY.get(symbol, symbol),
            "price":      round(float(price), 2) if price else None,
            "change":     round(float(change), 2),
            "change_pct": round(float(change_pct), 2),
        }
    except Exception:
        return {"symbol": DISPLAY.get(symbol, symbol), "price": None, "change": 0.0, "change_pct": 0.0}


@router.get("/tickers")
def get_tickers():
    with ThreadPoolExecutor(max_workers=8) as ex:
        return list(ex.map(_fetch_ticker, TICKERS))


@router.get("/insight")
def get_insight(
    portfolio_count: int = 0,
    total_capital: float = 0,
    current_user: User = Depends(get_current_user),
):
    with ThreadPoolExecutor(max_workers=8) as ex:
        quotes = list(ex.map(_fetch_ticker, TICKERS))
    quotes_line = ", ".join(
        f"{q['symbol']} ${q['price']} ({q['change_pct']:+.2f}%)"
        for q in quotes if q["price"] is not None
    )

    client = _get_client()
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=120,
        messages=[{
            "role": "user",
            "content": (
                f"You are Aria, an AI trading assistant. A trader has {portfolio_count} portfolio(s) "
                f"with ${total_capital:,.0f} total capital. "
                f"Current live quotes: {quotes_line}. "
                "Generate 1-2 sentences of specific, actionable market insight using ONLY the real "
                "prices/changes given above — do not invent price levels, support/resistance, or stop "
                "levels that aren't derivable from these numbers. "
                "Sound like a Bloomberg terminal alert. No markdown, no greetings."
            ),
        }],
    )
    return {"insight": resp.content[0].text}
