import os
import pandas as pd
import joblib
from app.ml.features import build_features, FEATURE_COLUMNS

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")

_model = None
_model_load_attempted = False


def _load_model():
    global _model, _model_load_attempted
    if not _model_load_attempted:
        _model_load_attempted = True
        if os.path.exists(MODEL_PATH):
            _model = joblib.load(MODEL_PATH)
    return _model


def get_ml_signal(df: pd.DataFrame) -> pd.Series:
    """Predicted probability price is up in LABEL_HORIZON_DAYS trading days.
    NaN in warmup rows and whenever no trained model is available yet —
    same convention every other indicator in engine.py already uses, so
    an untrained model makes ML_SIGNAL rules simply never fire, not crash."""
    model = _load_model()
    if model is None or len(df) == 0:
        return pd.Series([float("nan")] * len(df), index=df.index)

    features = build_features(df)[FEATURE_COLUMNS]
    valid = features.notna().all(axis=1)
    result = pd.Series([float("nan")] * len(df), index=df.index)
    if valid.any():
        proba = model.predict_proba(features.loc[valid])[:, 1]
        result.loc[valid] = proba
    return result
