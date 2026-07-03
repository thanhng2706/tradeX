from datetime import date
import pandas as pd
import yfinance as yf
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.models import PriceData


def get_price_data(ticker: str, start: date, end: date, db: Session) -> pd.DataFrame:
    ticker = ticker.upper()

    cached = (
        db.query(PriceData)
        .filter(PriceData.ticker == ticker, PriceData.date >= start, PriceData.date <= end)
        .order_by(PriceData.date)
        .all()
    )
    if cached:
        return pd.DataFrame(
            [{"date": r.date, "open": r.open, "high": r.high,
              "low": r.low, "close": r.close, "volume": r.volume}
             for r in cached]
        )

    t = yf.Ticker(ticker)
    hist = t.history(start=str(start), end=str(end))

    if hist.empty:
        raise ValueError(f"No price data found for {ticker} between {start} and {end}")

    # Normalize timezone and column names
    if hist.index.tzinfo is not None:
        hist.index = hist.index.tz_localize(None)
    hist = hist.reset_index()
    hist.columns = [c[0].lower() if isinstance(c, tuple) else c.lower() for c in hist.columns]
    hist = hist.rename(columns={"index": "date"})
    hist["date"] = pd.to_datetime(hist["date"]).dt.date

    records = [
        {
            "ticker": ticker,
            "date": row["date"],
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": int(row["volume"]),
        }
        for _, row in hist.iterrows()
    ]

    if records:
        stmt = pg_insert(PriceData.__table__).values(records).on_conflict_do_nothing()
        db.execute(stmt)
        db.commit()

    return pd.DataFrame(
        [{"date": r["date"], "open": r["open"], "high": r["high"],
          "low": r["low"], "close": r["close"], "volume": r["volume"]}
         for r in records]
    )
