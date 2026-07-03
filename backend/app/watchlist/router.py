from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import yfinance as yf

from app.database import get_db
from app.models import Watchlist, WatchlistAsset, User
from app.auth.router import get_current_user
from app.watchlist.schemas import (
    WatchlistOut, CreateWatchlistRequest,
    AddAssetRequest, AssetPrice, ChartPoint,
)

router = APIRouter(prefix="/watchlists", tags=["watchlists"])


@router.get("", response_model=list[WatchlistOut])
def list_watchlists(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(Watchlist).filter(Watchlist.user_id == current_user.id).all()


@router.post("", response_model=WatchlistOut)
def create_watchlist(
    body: CreateWatchlistRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wl = Watchlist(user_id=current_user.id, name=body.name.strip())
    db.add(wl)
    db.commit()
    db.refresh(wl)
    return wl


@router.delete("/{watchlist_id}", status_code=204)
def delete_watchlist(
    watchlist_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wl = db.query(Watchlist).filter(
        Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id
    ).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    db.delete(wl)
    db.commit()


@router.post("/{watchlist_id}/assets", response_model=WatchlistOut)
def add_asset(
    watchlist_id: int,
    body: AddAssetRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wl = db.query(Watchlist).filter(
        Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id
    ).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    symbol = body.symbol.strip().upper()

    existing = db.query(WatchlistAsset).filter(
        WatchlistAsset.watchlist_id == watchlist_id,
        WatchlistAsset.symbol == symbol,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"{symbol} is already in this watchlist")

    # Validate the ticker exists
    try:
        info = yf.Ticker(symbol).fast_info
        if not info.last_price:
            raise ValueError()
    except Exception:
        raise HTTPException(status_code=400, detail=f"Could not find ticker '{symbol}'")

    asset = WatchlistAsset(watchlist_id=watchlist_id, symbol=symbol)
    db.add(asset)
    db.commit()
    db.refresh(wl)
    return wl


@router.delete("/{watchlist_id}/assets/{symbol}", response_model=WatchlistOut)
def remove_asset(
    watchlist_id: int,
    symbol: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wl = db.query(Watchlist).filter(
        Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id
    ).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    asset = db.query(WatchlistAsset).filter(
        WatchlistAsset.watchlist_id == watchlist_id,
        WatchlistAsset.symbol == symbol.upper(),
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    db.delete(asset)
    db.commit()
    db.refresh(wl)
    return wl


def _fetch_30d(symbol: str) -> tuple[str, list[dict]]:
    try:
        hist = yf.Ticker(symbol).history(period="30d")
        if hist.empty:
            return symbol, []
        if hist.index.tzinfo is not None:
            hist.index = hist.index.tz_localize(None)
        return symbol, [
            {"date": str(idx.date()), "close": round(float(row["Close"]), 2)}
            for idx, row in hist.iterrows()
        ]
    except Exception:
        return symbol, []


@router.get("/{watchlist_id}/charts")
def get_all_charts(
    watchlist_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wl = db.query(Watchlist).filter(
        Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id
    ).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    symbols = [a.symbol for a in wl.assets]
    if not symbols:
        return {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        pairs = list(ex.map(_fetch_30d, symbols))
    return dict(pairs)


@router.get("/chart/{symbol}", response_model=list[ChartPoint])
def get_chart(symbol: str):
    try:
        hist = yf.Ticker(symbol.upper()).history(period="30d")
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


@router.get("/{watchlist_id}/prices", response_model=list[AssetPrice])
def get_prices(
    watchlist_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wl = db.query(Watchlist).filter(
        Watchlist.id == watchlist_id, Watchlist.user_id == current_user.id
    ).first()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")

    results = []
    for asset in wl.assets:
        try:
            info = yf.Ticker(asset.symbol).fast_info
            price = info.last_price
            prev = info.previous_close
            change_pct = ((price - prev) / prev * 100) if prev else 0.0
            results.append(AssetPrice(
                symbol=asset.symbol,
                price=round(float(price), 2) if price else None,
                change_pct=round(float(change_pct), 2),
                day_high=round(float(info.day_high), 2) if info.day_high else None,
                day_low=round(float(info.day_low), 2) if info.day_low else None,
            ))
        except Exception:
            results.append(AssetPrice(
                symbol=asset.symbol,
                price=None, change_pct=None, day_high=None, day_low=None,
            ))
    return results
