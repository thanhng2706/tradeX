from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Portfolio, Strategy
from app.strategies.schemas import (
    StrategyCreate,
    StrategyUpdate,
    StrategyResponse,
    ParseNLRequest,
    ParseNLResponse,
    ConditionSet,
)
from app.strategies.nl_parser import parse_nl_strategy
from app.auth.router import get_current_user

router = APIRouter(tags=["strategies"])


def get_portfolio_or_404(portfolio_id: int, user: User, db: Session) -> Portfolio:
    portfolio = (
        db.query(Portfolio)
        .filter(Portfolio.id == portfolio_id, Portfolio.user_id == user.id)
        .first()
    )
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


@router.get("/portfolios/{portfolio_id}/strategies", response_model=list[StrategyResponse])
def list_strategies(
    portfolio_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_portfolio_or_404(portfolio_id, current_user, db)
    return db.query(Strategy).filter(Strategy.portfolio_id == portfolio_id).all()


@router.post("/portfolios/{portfolio_id}/strategies", response_model=StrategyResponse, status_code=201)
def create_strategy(
    portfolio_id: int,
    body: StrategyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_portfolio_or_404(portfolio_id, current_user, db)
    strategy = Strategy(
        **body.model_dump(exclude={"buy_conditions", "sell_conditions"}),
        buy_conditions=body.buy_conditions.model_dump(),
        sell_conditions=body.sell_conditions.model_dump(),
        portfolio_id=portfolio_id,
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    return strategy


@router.put("/strategies/{strategy_id}", response_model=StrategyResponse)
def update_strategy(
    strategy_id: int,
    body: StrategyUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    strategy = (
        db.query(Strategy)
        .join(Portfolio)
        .filter(Strategy.id == strategy_id, Portfolio.user_id == current_user.id)
        .first()
    )
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    updates = body.model_dump(exclude_none=True)
    for field in ("buy_conditions", "sell_conditions"):
        if field in updates:
            updates[field] = updates[field].model_dump() if hasattr(updates[field], "model_dump") else updates[field]

    for key, val in updates.items():
        setattr(strategy, key, val)

    db.commit()
    db.refresh(strategy)
    return strategy


@router.delete("/strategies/{strategy_id}", status_code=204)
def delete_strategy(
    strategy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    strategy = (
        db.query(Strategy)
        .join(Portfolio)
        .filter(Strategy.id == strategy_id, Portfolio.user_id == current_user.id)
        .first()
    )
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    db.delete(strategy)
    db.commit()


@router.post("/strategies/parse-nl", response_model=ParseNLResponse)
def parse_nl(
    body: ParseNLRequest,
    current_user: User = Depends(get_current_user),
):
    result = parse_nl_strategy(body.text)
    return ParseNLResponse(
        name=result.get("name"),
        ticker=result.get("ticker"),
        buy_conditions=ConditionSet(**result.get("buy_conditions", {"logic": "AND", "rules": []})),
        sell_conditions=ConditionSet(**result.get("sell_conditions", {"logic": "AND", "rules": []})),
    )
