import logging
from datetime import date, datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import BrokerDeployment, BrokerOrder, BrokerEvent, BrokerConnection
from app.backtesting.data import get_price_data
from app.backtesting.engine import evaluate_latest_signal
from app.broker.crypto import decrypt
from app.broker.alpaca_client import submit_order, get_position, get_order, list_positions, get_account, AlpacaAuthError

logger = logging.getLogger("broker.scheduler")

MAX_CONSECUTIVE_FAILURES = 3
LOOKBACK_DAYS = 400  # enough calendar days for any indicator period (e.g. SMA/EMA 200) to be non-NaN
TERMINAL_ORDER_STATUSES = {"filled", "canceled", "rejected", "expired"}

# Phase 2 guardrails — hard ceilings on real-money order placement
MAX_POSITION_SIZE_PCT = 25.0      # per-strategy position_size_pct ceiling, enforced at deploy time
MAX_TOTAL_EXPOSURE_PCT = 75.0     # total open position market value / account equity, before blocking a new BUY
MAX_ORDER_NOTIONAL_USD = 10000.0  # blunt per-order dollar cap, catches sizing bugs regardless of pct math


def _event_exists(db: Session, deployment_id: int, event_date: str, event_type: str) -> bool:
    return (
        db.query(BrokerEvent)
        .filter(BrokerEvent.deployment_id == deployment_id, BrokerEvent.date == event_date, BrokerEvent.type == event_type)
        .first()
        is not None
    )


def _log_event(db: Session, deployment_id: int, event_date: str, event_type: str, message: str) -> None:
    if _event_exists(db, deployment_id, event_date, event_type):
        return
    db.add(BrokerEvent(deployment_id=deployment_id, date=event_date, type=event_type, message=message))


def reserve_order_slot(db: Session, deployment_id: int, trade_date, side: str, qty: float, **extra) -> BrokerOrder | None:
    """Claims the (deployment_id, trade_date, side) dedupe slot via a real commit, BEFORE any
    real broker call is made. This is the only thing that can safely race two concurrent ticks
    (e.g. two overlapping "Run Now" clicks) against the same signal — the DB unique constraint
    lets exactly one of them through, so only one ever reaches submit_order. Returns None if the
    slot is already taken."""
    order = BrokerOrder(
        deployment_id=deployment_id, side=side, qty=qty, order_type="market",
        status="pending_local", trade_date=trade_date, **extra,
    )
    db.add(order)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    db.refresh(order)
    return order


def poll_order_statuses(deployment: BrokerDeployment, db: Session, api_key: str, api_secret: str, is_paper: bool) -> None:
    pending = (
        db.query(BrokerOrder)
        .filter(BrokerOrder.deployment_id == deployment.id, BrokerOrder.alpaca_order_id.isnot(None))
        .all()
    )
    for order in pending:
        if order.status in TERMINAL_ORDER_STATUSES:
            continue
        try:
            remote = get_order(api_key, api_secret, is_paper, order.alpaca_order_id)
        except AlpacaAuthError:
            raise
        except Exception:
            logger.exception("Failed to poll order %s for deployment %s", order.alpaca_order_id, deployment.id)
            continue

        new_status = remote.get("status")
        newly_filled = new_status == "filled" and order.status != "filled"
        order.status = new_status
        if remote.get("filled_qty") is not None:
            order.filled_qty = float(remote["filled_qty"])
        if remote.get("filled_avg_price") is not None:
            order.filled_avg_price = float(remote["filled_avg_price"])
        if newly_filled:
            _log_event(db, deployment.id, str(order.trade_date), "ORDER_FILLED",
                       f"{order.side.title()} order filled: {order.filled_qty:.4f} shares @ ${order.filled_avg_price:.2f}")


def run_deployment_tick(deployment: BrokerDeployment, db: Session) -> None:
    strategy = deployment.strategy

    if strategy.asset_type == "option":
        from app.broker.options_scheduler import run_option_deployment_tick
        run_option_deployment_tick(deployment, db)
        return

    conn = (
        db.query(BrokerConnection)
        .filter(BrokerConnection.user_id == strategy.portfolio.user_id)
        .first()
    )
    if not conn:
        deployment.status = "error"
        deployment.last_error = "No broker connection found for this user"
        db.commit()
        return

    try:
        api_key = decrypt(conn.api_key_encrypted)
        api_secret = decrypt(conn.api_secret_encrypted)
    except Exception:
        deployment.status = "error"
        deployment.last_error = "Could not decrypt stored broker credentials"
        db.commit()
        return

    try:
        poll_order_statuses(deployment, db, api_key, api_secret, conn.is_paper)
    except AlpacaAuthError:
        deployment.status = "error"
        deployment.last_error = "Alpaca rejected stored credentials"
        db.commit()
        return

    if conn.kill_switch_active:
        deployment.last_tick_at = datetime.utcnow()
        db.commit()
        return

    today = date.today()
    lookback_start = today - timedelta(days=LOOKBACK_DAYS)
    df = get_price_data(strategy.ticker, lookback_start, today + timedelta(days=1), db)

    if len(df) < 2:
        deployment.last_tick_at = datetime.utcnow()
        db.commit()
        return

    signal = evaluate_latest_signal(strategy.buy_conditions, strategy.sell_conditions, df)
    signal_date = signal["date"]
    trade_date = df["date"].iloc[-1]

    try:
        position = get_position(api_key, api_secret, conn.is_paper, strategy.ticker)
    except AlpacaAuthError:
        deployment.status = "error"
        deployment.last_error = "Alpaca rejected stored credentials"
        db.commit()
        return
    has_position = position is not None and float(position.get("qty", 0)) > 0

    side = None
    qty = 0.0
    if signal["buy_signal"] and not has_position:
        side = "BUY"
        qty = (strategy.portfolio.starting_balance * strategy.position_size_pct / 100) / signal["close"]
    elif signal["sell_signal"] and has_position:
        side = "SELL"
        qty = float(position["qty"])
    elif signal["buy_signal"] and has_position:
        _log_event(db, deployment.id, signal_date, "SIGNAL_SUPPRESSED",
                   "Buy signal triggered but a position is already open on Alpaca")
    elif signal["sell_signal"] and not has_position:
        _log_event(db, deployment.id, signal_date, "SIGNAL_SUPPRESSED",
                   "Sell signal triggered but no real position is held on Alpaca")

    if side == "BUY":
        order_notional = qty * signal["close"]
        try:
            account = get_account(api_key, api_secret, conn.is_paper)
            equity = float(account.get("equity", 0))
            positions = list_positions(api_key, api_secret, conn.is_paper)
            total_exposure = sum(abs(float(p.get("market_value", 0))) for p in positions)
        except AlpacaAuthError:
            deployment.status = "error"
            deployment.last_error = "Alpaca rejected stored credentials"
            db.commit()
            return

        projected_exposure_pct = ((total_exposure + order_notional) / equity * 100) if equity else 100.0
        if order_notional > MAX_ORDER_NOTIONAL_USD:
            _log_event(db, deployment.id, signal_date, "ORDER_BLOCKED_CAP",
                       f"Blocked: order notional ${order_notional:,.2f} exceeds max per-order cap of ${MAX_ORDER_NOTIONAL_USD:,.2f}")
            side = None
        elif projected_exposure_pct > MAX_TOTAL_EXPOSURE_PCT:
            _log_event(db, deployment.id, signal_date, "ORDER_BLOCKED_CAP",
                       f"Blocked: order would bring total exposure to {projected_exposure_pct:.1f}% of equity, exceeding max of {MAX_TOTAL_EXPOSURE_PCT:.0f}%")
            side = None

    if side:
        reserved = reserve_order_slot(db, deployment.id, trade_date, side, qty)
        if reserved:
            _log_event(db, deployment.id, signal_date, "BUY_SIGNAL" if side == "BUY" else "SELL_SIGNAL",
                       f"{side.title()} conditions met")
            try:
                order = submit_order(api_key, api_secret, conn.is_paper, strategy.ticker, qty, side)
                reserved.alpaca_order_id = order.get("id")
                reserved.status = order.get("status")
                _log_event(db, deployment.id, signal_date, "ORDER_SUBMITTED",
                           f"Submitted {side.lower()} order for {qty:.4f} shares of {strategy.ticker}")
                deployment.consecutive_failures = 0
            except AlpacaAuthError:
                db.delete(reserved)
                deployment.status = "error"
                deployment.last_error = "Alpaca rejected stored credentials"
                db.commit()
                return
            except Exception as e:
                db.delete(reserved)
                deployment.consecutive_failures += 1
                _log_event(db, deployment.id, signal_date, "ORDER_REJECTED", f"Order failed: {e}")
                if deployment.consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    deployment.status = "error"
                    deployment.last_error = f"Paused after {MAX_CONSECUTIVE_FAILURES} consecutive order failures: {e}"
                    _log_event(db, deployment.id, signal_date, "DEPLOYMENT_PAUSED",
                               f"Deployment auto-paused after {MAX_CONSECUTIVE_FAILURES} consecutive failures")

    deployment.last_tick_at = datetime.utcnow()
    db.commit()


def run_all_deployments_tick() -> None:
    db = SessionLocal()
    try:
        deployments = db.query(BrokerDeployment).filter(BrokerDeployment.status == "active").all()
        for deployment in deployments:
            try:
                run_deployment_tick(deployment, db)
            except Exception:
                logger.exception("Broker tick failed for deployment %s", deployment.id)
                db.rollback()
    finally:
        db.close()


def poll_all_pending_orders_tick() -> None:
    """Lightweight tick that only refreshes order fill status — runs far more often than
    the once-daily signal tick so Order History reflects real fills quickly, not just at 21:30 UTC."""
    db = SessionLocal()
    try:
        deployments = db.query(BrokerDeployment).filter(BrokerDeployment.status == "active").all()
        for deployment in deployments:
            has_pending = any(o.status not in TERMINAL_ORDER_STATUSES for o in deployment.orders)
            if not has_pending:
                continue
            conn = (
                db.query(BrokerConnection)
                .filter(BrokerConnection.user_id == deployment.strategy.portfolio.user_id)
                .first()
            )
            if not conn:
                continue
            try:
                api_key = decrypt(conn.api_key_encrypted)
                api_secret = decrypt(conn.api_secret_encrypted)
                poll_order_statuses(deployment, db, api_key, api_secret, conn.is_paper)
                db.commit()
            except AlpacaAuthError:
                deployment.status = "error"
                deployment.last_error = "Alpaca rejected stored credentials"
                db.commit()
            except Exception:
                logger.exception("Order status poll failed for deployment %s", deployment.id)
                db.rollback()
    finally:
        db.close()


scheduler = BackgroundScheduler()


def start_scheduler() -> None:
    if scheduler.running:
        return
    scheduler.add_job(run_all_deployments_tick, "cron", hour=21, minute=30, id="broker_tick", replace_existing=True)
    scheduler.add_job(poll_all_pending_orders_tick, "interval", minutes=5, id="broker_order_poll", replace_existing=True)
    scheduler.start()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
