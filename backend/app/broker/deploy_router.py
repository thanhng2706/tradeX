from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Strategy, Portfolio, BrokerDeployment, BrokerConnection
from app.auth.router import get_current_user
from app.broker.deploy_schemas import BrokerDeploymentResponse
from app.broker.scheduler import run_deployment_tick, poll_order_statuses, MAX_POSITION_SIZE_PCT
from app.broker.crypto import decrypt
from app.broker.alpaca_client import AlpacaAuthError

router = APIRouter(tags=["broker-deploy"])


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


def _get_deployment(strategy_id: int, db: Session) -> BrokerDeployment | None:
    return db.query(BrokerDeployment).filter(BrokerDeployment.strategy_id == strategy_id).first()


@router.post("/strategies/{strategy_id}/broker-deploy", response_model=BrokerDeploymentResponse)
def deploy_strategy(
    strategy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    strategy = _get_strategy(strategy_id, current_user, db)

    conn = db.query(BrokerConnection).filter(BrokerConnection.user_id == current_user.id).first()
    if not conn:
        raise HTTPException(status_code=400, detail="Connect an Alpaca account first")
    if not conn.is_paper:
        raise HTTPException(status_code=400, detail="Live trading is not enabled yet — connect a paper account")
    if conn.kill_switch_active:
        raise HTTPException(status_code=400, detail="Kill switch is active — resume trading first")
    if strategy.position_size_pct > MAX_POSITION_SIZE_PCT:
        raise HTTPException(
            status_code=400,
            detail=f"Position size {strategy.position_size_pct:.0f}% exceeds the max allowed {MAX_POSITION_SIZE_PCT:.0f}% for broker deployment — lower it in the strategy editor first",
        )
    if strategy.asset_type == "option" and (not strategy.option_type or strategy.strike_distance_pct is None or strategy.dte_min is None or strategy.dte_max is None):
        raise HTTPException(
            status_code=400,
            detail="Option strategy is missing required fields (option_type/strike_distance_pct/dte_min/dte_max) — fill in the Option Leg panel first",
        )

    deployment = _get_deployment(strategy_id, db)
    if deployment:
        if deployment.status == "active":
            return deployment
        deployment.status = "active"
        deployment.started_at = date.today()
        deployment.consecutive_failures = 0
        deployment.last_error = None
    else:
        deployment = BrokerDeployment(strategy_id=strategy_id, status="active", started_at=date.today())
        db.add(deployment)

    db.commit()
    db.refresh(deployment)
    return deployment


@router.delete("/strategies/{strategy_id}/broker-deploy", response_model=BrokerDeploymentResponse)
def undeploy_strategy(
    strategy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_strategy(strategy_id, current_user, db)
    deployment = _get_deployment(strategy_id, db)
    if not deployment:
        raise HTTPException(status_code=404, detail="No deployment found")
    deployment.status = "stopped"
    db.commit()
    db.refresh(deployment)
    return deployment


@router.get("/strategies/{strategy_id}/broker-deploy", response_model=BrokerDeploymentResponse)
def get_deployment_status(
    strategy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_strategy(strategy_id, current_user, db)
    deployment = _get_deployment(strategy_id, db)
    if not deployment:
        raise HTTPException(status_code=404, detail="No deployment found")

    conn = db.query(BrokerConnection).filter(BrokerConnection.user_id == current_user.id).first()
    if conn:
        try:
            api_key = decrypt(conn.api_key_encrypted)
            api_secret = decrypt(conn.api_secret_encrypted)
            poll_order_statuses(deployment, db, api_key, api_secret, conn.is_paper)
            db.commit()
            db.refresh(deployment)
        except AlpacaAuthError:
            db.rollback()
        except Exception:
            db.rollback()

    return deployment


@router.post("/strategies/{strategy_id}/broker-deploy/run-now", response_model=BrokerDeploymentResponse)
def run_now(
    strategy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_strategy(strategy_id, current_user, db)
    deployment = _get_deployment(strategy_id, db)
    if not deployment:
        raise HTTPException(status_code=404, detail="No deployment found")
    if deployment.status != "active":
        raise HTTPException(status_code=400, detail=f"Deployment is {deployment.status}, not active")

    conn = db.query(BrokerConnection).filter(BrokerConnection.user_id == current_user.id).first()
    if conn and conn.kill_switch_active:
        raise HTTPException(status_code=400, detail="Kill switch is active — resume trading first")

    run_deployment_tick(deployment, db)
    db.refresh(deployment)
    return deployment
