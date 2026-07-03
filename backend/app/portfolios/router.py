from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Portfolio
from app.portfolios.schemas import PortfolioCreate, PortfolioResponse
from app.auth.router import get_current_user

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


@router.get("", response_model=list[PortfolioResponse])
def list_portfolios(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(Portfolio).filter(Portfolio.user_id == current_user.id).all()


@router.post("", response_model=PortfolioResponse, status_code=201)
def create_portfolio(
    body: PortfolioCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    portfolio = Portfolio(**body.model_dump(), user_id=current_user.id)
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)
    return portfolio


@router.delete("/{portfolio_id}", status_code=204)
def delete_portfolio(
    portfolio_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    portfolio = (
        db.query(Portfolio)
        .filter(Portfolio.id == portfolio_id, Portfolio.user_id == current_user.id)
        .first()
    )
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    db.delete(portfolio)
    db.commit()
