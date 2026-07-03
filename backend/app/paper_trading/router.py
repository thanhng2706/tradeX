from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Strategy, Portfolio, PaperTrade
from app.paper_trading.schemas import PaperTradeResponse, PaperStatusResponse
from app.paper_trading.service import get_paper_status
from app.paper_trading.health_check import run_health_check
from app.auth.router import get_current_user

router = APIRouter(tags=["paper-trading"])


def _get_strategy(strategy_id: int, user: User, db: Session) -> Strategy:
    strategy = (
        db.query(Strategy)
        .join(Portfolio)
        .filter(Strategy.id == strategy_id, Portfolio.user_id == user.id)
        .first()
    )
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy


@router.post("/strategies/{strategy_id}/paper-trade", response_model=PaperTradeResponse)
def activate_paper_trade(
    strategy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    strategy = _get_strategy(strategy_id, current_user, db)

    existing = (
        db.query(PaperTrade)
        .filter(PaperTrade.strategy_id == strategy_id, PaperTrade.status == "active")
        .first()
    )
    if existing:
        return existing

    pt = PaperTrade(strategy_id=strategy_id, started_at=date.today(), status="active")
    db.add(pt)
    db.commit()
    db.refresh(pt)
    return pt


@router.delete("/strategies/{strategy_id}/paper-trade", response_model=PaperTradeResponse)
def deactivate_paper_trade(
    strategy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_strategy(strategy_id, current_user, db)
    pt = (
        db.query(PaperTrade)
        .filter(PaperTrade.strategy_id == strategy_id, PaperTrade.status == "active")
        .first()
    )
    if not pt:
        raise HTTPException(status_code=404, detail="No active paper trade")
    pt.status = "stopped"
    db.commit()
    db.refresh(pt)
    return pt


@router.get("/strategies/{strategy_id}/paper-trade", response_model=PaperStatusResponse)
def get_paper_trade_status(
    strategy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    strategy = _get_strategy(strategy_id, current_user, db)
    pt = (
        db.query(PaperTrade)
        .filter(PaperTrade.strategy_id == strategy_id, PaperTrade.status == "active")
        .first()
    )
    if not pt:
        raise HTTPException(status_code=404, detail="No active paper trade for this strategy")

    status = get_paper_status(pt, strategy, db)
    error = status.pop("error", None)

    defaults = {
        "total_return_pct": 0.0, "final_balance": 0.0,
        "starting_balance": strategy.portfolio.starting_balance,
        "num_trades": 0, "win_rate": 0.0, "sharpe_ratio": 0.0,
        "max_drawdown_pct": 0.0, "current_position": "OUT",
        "last_buy_price": 0.0, "current_price": 0.0, "unrealized_pct": 0.0,
        "recent_trades": [], "equity_curve": [], "events": [], "days_active": 0,
    }
    if error:
        return PaperStatusResponse(paper_trade=pt, error=error, **defaults)

    return PaperStatusResponse(paper_trade=pt, error=None, **status)


@router.post("/strategies/{strategy_id}/paper-trade/health-check", response_model=PaperTradeResponse)
def run_health_check_endpoint(
    strategy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    strategy = _get_strategy(strategy_id, current_user, db)
    pt = (
        db.query(PaperTrade)
        .filter(PaperTrade.strategy_id == strategy_id, PaperTrade.status == "active")
        .first()
    )
    if not pt:
        raise HTTPException(status_code=404, detail="No active paper trade")

    paper_status = get_paper_status(pt, strategy, db)
    if "error" in paper_status:
        raise HTTPException(status_code=400, detail=paper_status["error"])

    from datetime import datetime
    score, report = run_health_check(strategy, paper_status)
    pt.health_score = score
    pt.health_report = report
    pt.health_checked_at = datetime.utcnow()
    db.commit()
    db.refresh(pt)
    return pt
