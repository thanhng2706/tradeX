import json
import os
from fastapi import APIRouter

METRICS_PATH = os.path.join(os.path.dirname(__file__), "metrics.json")

router = APIRouter(prefix="/ml", tags=["ml"])


@router.get("/info")
def ml_info():
    if not os.path.exists(METRICS_PATH):
        return {"trained": False}
    with open(METRICS_PATH) as f:
        metrics = json.load(f)
    return {"trained": True, **metrics}
