from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, BrokerEvent, BrokerDeployment, Strategy, Portfolio
from app.auth.router import get_current_user
from app.broker.schemas import NotificationItem, NotificationsResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _base_query(db: Session, current_user: User):
    return (
        db.query(BrokerEvent)
        .join(BrokerDeployment, BrokerEvent.deployment_id == BrokerDeployment.id)
        .join(Strategy, BrokerDeployment.strategy_id == Strategy.id)
        .join(Portfolio, Strategy.portfolio_id == Portfolio.id)
        .filter(Portfolio.user_id == current_user.id)
    )


@router.get("", response_model=NotificationsResponse)
def list_notifications(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    last_seen = current_user.last_notifications_seen_at

    unread_query = _base_query(db, current_user)
    unread_count = unread_query.filter(BrokerEvent.created_at > last_seen).count() if last_seen else unread_query.count()

    events = _base_query(db, current_user).order_by(BrokerEvent.created_at.desc()).limit(limit).all()
    items = [
        NotificationItem(
            id=e.id,
            deployment_id=e.deployment_id,
            portfolio_id=e.deployment.strategy.portfolio_id,
            strategy_id=e.deployment.strategy_id,
            strategy_name=e.deployment.strategy.name,
            ticker=e.deployment.strategy.ticker,
            type=e.type,
            message=e.message,
            created_at=e.created_at,
            read=last_seen is not None and e.created_at <= last_seen,
        )
        for e in events
    ]

    return NotificationsResponse(unread_count=unread_count, items=items)


@router.post("/mark-read", response_model=NotificationsResponse)
def mark_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.last_notifications_seen_at = datetime.utcnow()
    db.commit()
    return list_notifications(20, current_user, db)
