from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth.router import get_current_user
from app.models import User, Strategy, Portfolio
from app.library.data import LIBRARY_STRATEGIES, LIBRARY_MAP

router = APIRouter(tags=["library"])


@router.get("/library")
def list_library(_: User = Depends(get_current_user)):
    return LIBRARY_STRATEGIES


@router.post("/library/{strategy_id}/copy")
def copy_to_portfolio(
    strategy_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = LIBRARY_MAP.get(strategy_id)
    if not template:
        raise HTTPException(status_code=404, detail="Library strategy not found")

    portfolio_id = body.get("portfolio_id")
    if not portfolio_id:
        raise HTTPException(status_code=422, detail="portfolio_id required")

    portfolio = db.query(Portfolio).filter(
        Portfolio.id == portfolio_id,
        Portfolio.user_id == current_user.id,
    ).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    strategy = Strategy(
        name=template["name"],
        description=template["description"],
        ticker=template["ticker"],
        buy_conditions=template["buy_conditions"],
        sell_conditions=template["sell_conditions"],
        position_size_pct=template["position_size_pct"],
        portfolio_id=portfolio_id,
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    return strategy
