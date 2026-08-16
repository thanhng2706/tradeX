"""Offline training script for the ML_SIGNAL indicator.

Not part of any live request path. Run manually:
    docker compose exec backend python -m app.ml.train
"""
import json
import os
from datetime import date, timedelta

import joblib
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score

from app.database import SessionLocal
from app.backtesting.data import get_price_data
from app.ml.features import build_features, FEATURE_COLUMNS
from app.research.screener_data import CATEGORIES

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")
METRICS_PATH = os.path.join(os.path.dirname(__file__), "metrics.json")

LABEL_HORIZON_DAYS = 5
YEARS_HISTORY = 6
TEST_FRACTION = 0.2


def _universe() -> list[str]:
    seen: set[str] = set()
    tickers: list[str] = []
    for group in CATEGORIES.values():
        for t in group:
            if t not in seen:
                seen.add(t)
                tickers.append(t)
    return tickers


def _build_ticker_dataset(ticker: str, db) -> pd.DataFrame | None:
    end = date.today()
    start = end - timedelta(days=365 * YEARS_HISTORY)
    try:
        df = get_price_data(ticker, start, end, db)
    except Exception as e:
        print(f"  skip {ticker}: {e}")
        return None
    if len(df) < 300:
        print(f"  skip {ticker}: only {len(df)} rows")
        return None

    df = df.sort_values("date").reset_index(drop=True)
    features = build_features(df)
    label = (df["close"].shift(-LABEL_HORIZON_DAYS) > df["close"]).astype(int)

    data = features.copy()
    data["label"] = label
    # Last LABEL_HORIZON_DAYS rows have no real future price to label against.
    data = data.iloc[:-LABEL_HORIZON_DAYS]
    data = data.dropna(subset=FEATURE_COLUMNS)
    return data


def main():
    db = SessionLocal()
    tickers = _universe()
    print(f"Building dataset from {len(tickers)} tickers...")

    train_frames, test_frames = [], []
    for i, ticker in enumerate(tickers):
        print(f"[{i + 1}/{len(tickers)}] {ticker}")
        data = _build_ticker_dataset(ticker, db)
        if data is None or len(data) < 50:
            continue
        # Chronological split per-ticker (not shuffled) — same overfitting
        # discipline as the genetic optimizer's train/validation split.
        split_idx = int(len(data) * (1 - TEST_FRACTION))
        train_frames.append(data.iloc[:split_idx])
        test_frames.append(data.iloc[split_idx:])

    db.close()

    if not train_frames or not test_frames:
        raise RuntimeError("No usable ticker data collected — aborting training")

    train_df = pd.concat(train_frames, ignore_index=True)
    test_df = pd.concat(test_frames, ignore_index=True)
    print(f"Train rows: {len(train_df)}, Test rows: {len(test_df)}")

    X_train, y_train = train_df[FEATURE_COLUMNS], train_df["label"]
    X_test, y_test = test_df[FEATURE_COLUMNS], test_df["label"]

    model = HistGradientBoostingClassifier(random_state=42)
    model.fit(X_train, y_train)

    proba = model.predict_proba(X_test)[:, 1]
    preds = (proba >= 0.5).astype(int)

    metrics = {
        "trained_at": date.today().isoformat(),
        "universe_size": len(tickers),
        "label_horizon_days": LABEL_HORIZON_DAYS,
        "train_rows": len(train_df),
        "test_rows": len(test_df),
        "baseline_positive_rate": round(float(y_test.mean()), 4),
        "accuracy": round(float(accuracy_score(y_test, preds)), 4),
        "precision": round(float(precision_score(y_test, preds, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, preds, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, proba)), 4),
    }

    joblib.dump(model, MODEL_PATH)
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    print("Saved model to", MODEL_PATH)
    print("Metrics:", json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
