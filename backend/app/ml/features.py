import numpy as np
import pandas as pd
from app.backtesting.engine import _rsi, _macd, _bollinger, _atr, _roc

FEATURE_COLUMNS = ["rsi14", "macd_hist", "bb_pctb", "atr_norm", "roc10", "vol_z20", "ret5d"]


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Causal/rolling features only — no lookahead. Same NaN-in-warmup-rows
    convention as every other indicator in backtesting/engine.py."""
    close = df["close"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"].astype(float)

    rsi14 = _rsi(close, 14)
    _, _, macd_hist = _macd(close)
    upper, _, lower = _bollinger(close)
    bb_pctb = (close - lower) / (upper - lower).replace(0, np.nan)
    atr_norm = _atr(high, low, close, 14) / close
    roc10 = _roc(close, 10)
    vol_mean20 = volume.rolling(window=20).mean()
    vol_std20 = volume.rolling(window=20).std()
    vol_z20 = (volume - vol_mean20) / vol_std20.replace(0, np.nan)
    ret5d = close.pct_change(5) * 100

    return pd.DataFrame({
        "rsi14": rsi14,
        "macd_hist": macd_hist,
        "bb_pctb": bb_pctb,
        "atr_norm": atr_norm,
        "roc10": roc10,
        "vol_z20": vol_z20,
        "ret5d": ret5d,
    }, index=df.index)
