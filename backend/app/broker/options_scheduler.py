import logging
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from app.models import BrokerDeployment, BrokerOrder, BrokerConnection
from app.backtesting.data import get_price_data
from app.backtesting.engine import evaluate_latest_signal
from app.backtesting.options_engine import _strike_for
from app.broker.crypto import decrypt
from app.broker.alpaca_client import (
    submit_order, get_account, list_positions, get_option_contracts, get_option_snapshot, AlpacaAuthError,
)
from app.broker.options_resolver import find_contract
from app.broker.scheduler import (
    _log_event, poll_order_statuses, reserve_order_slot,
    LOOKBACK_DAYS, MAX_CONSECUTIVE_FAILURES, MAX_ORDER_NOTIONAL_USD, MAX_TOTAL_EXPOSURE_PCT,
)

logger = logging.getLogger("broker.options_scheduler")

DEFAULT_DTE = 35


def _current_open_order(db: Session, deployment_id: int) -> BrokerOrder | None:
    orders = (
        db.query(BrokerOrder)
        .filter(BrokerOrder.deployment_id == deployment_id)
        .order_by(BrokerOrder.trade_date, BrokerOrder.created_at)
        .all()
    )
    open_order: BrokerOrder | None = None
    for o in orders:
        if o.side == "BUY":
            open_order = o
        elif o.side == "SELL" and open_order and o.contract_symbol == open_order.contract_symbol:
            open_order = None
    return open_order


def _snapshot_premium(
    api_key: str, api_secret: str, underlying: str,
    option_type: str, strike: float, expiration: date, contract_symbol: str,
) -> float | None:
    snapshots = get_option_snapshot(api_key, api_secret, underlying, option_type, strike, expiration.isoformat())
    snap = snapshots.get(contract_symbol)
    if not snap:
        return None
    quote = snap.get("latestQuote") or {}
    ask = quote.get("ap")
    bid = quote.get("bp")
    if ask and bid:
        return (float(ask) + float(bid)) / 2
    if ask:
        return float(ask)
    trade = snap.get("latestTrade") or {}
    if trade.get("p"):
        return float(trade["p"])
    return None


def run_option_deployment_tick(deployment: BrokerDeployment, db: Session) -> None:
    strategy = deployment.strategy
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

    open_order = _current_open_order(db, deployment.id)

    # ── Exit check ──────────────────────────────────────────────────────────
    if open_order:
        try:
            premium = _snapshot_premium(
                api_key, api_secret, strategy.ticker,
                open_order.option_type, open_order.strike, open_order.expiration, open_order.contract_symbol,
            )
        except AlpacaAuthError:
            deployment.status = "error"
            deployment.last_error = "Alpaca rejected stored credentials"
            db.commit()
            return

        dte_remaining = (open_order.expiration - today).days
        days_held = (trade_date - open_order.trade_date).days
        pnl_pct = None
        if premium is not None and open_order.filled_avg_price:
            pnl_pct = (premium - open_order.filled_avg_price) / open_order.filled_avg_price * 100

        exit_reason = None
        if dte_remaining <= 0:
            exit_reason = "EXPIRED"
        elif pnl_pct is not None and strategy.take_profit_pct is not None and pnl_pct >= strategy.take_profit_pct:
            exit_reason = "TAKE_PROFIT"
        elif pnl_pct is not None and strategy.stop_loss_pct is not None and pnl_pct <= -abs(strategy.stop_loss_pct):
            exit_reason = "STOP_LOSS"
        elif strategy.max_days_held is not None and days_held >= strategy.max_days_held:
            exit_reason = "MAX_DAYS_HELD"
        elif signal["sell_signal"]:
            exit_reason = "SELL_SIGNAL"

        if exit_reason:
            reserved = reserve_order_slot(
                db, deployment.id, trade_date, "SELL", open_order.qty,
                contract_symbol=open_order.contract_symbol, strike=open_order.strike,
                expiration=open_order.expiration, option_type=open_order.option_type,
            )
            if reserved:
                try:
                    order = submit_order(api_key, api_secret, conn.is_paper, open_order.contract_symbol, open_order.qty, "SELL")
                    reserved.alpaca_order_id = order.get("id")
                    reserved.status = order.get("status")
                    _log_event(db, deployment.id, signal_date, "SELL_SIGNAL" if exit_reason == "SELL_SIGNAL" else "ORDER_SUBMITTED",
                               f"Closing {open_order.qty} {open_order.option_type} contract(s) ({exit_reason})")
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
                    _log_event(db, deployment.id, signal_date, "ORDER_REJECTED", f"Close order failed: {e}")
                    if deployment.consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                        deployment.status = "error"
                        deployment.last_error = f"Paused after {MAX_CONSECUTIVE_FAILURES} consecutive order failures: {e}"
                        _log_event(db, deployment.id, signal_date, "DEPLOYMENT_PAUSED",
                                   f"Deployment auto-paused after {MAX_CONSECUTIVE_FAILURES} consecutive failures")
        deployment.last_tick_at = datetime.utcnow()
        db.commit()
        return

    # ── Entry check ─────────────────────────────────────────────────────────
    if not signal["buy_signal"]:
        deployment.last_tick_at = datetime.utcnow()
        db.commit()
        return

    dte_min = strategy.dte_min or DEFAULT_DTE
    dte_max = strategy.dte_max or DEFAULT_DTE
    dte_target = (dte_min + dte_max) / 2
    target_expiration = today + timedelta(days=dte_target)
    target_strike = _strike_for(signal["close"], strategy.strike_distance_pct, strategy.option_type)

    try:
        contracts = get_option_contracts(
            api_key, api_secret, conn.is_paper, strategy.ticker, strategy.option_type,
            (today + timedelta(days=dte_min)).isoformat(), (today + timedelta(days=dte_max)).isoformat(),
        )
    except AlpacaAuthError:
        deployment.status = "error"
        deployment.last_error = "Alpaca rejected stored credentials"
        db.commit()
        return

    contract = find_contract(contracts, target_strike, target_expiration)
    if not contract:
        _log_event(db, deployment.id, signal_date, "SIGNAL_SUPPRESSED",
                   f"Buy signal met but no {strategy.option_type} contract found for {strategy.ticker} near strike ${target_strike:.2f}")
        deployment.last_tick_at = datetime.utcnow()
        db.commit()
        return

    try:
        premium = _snapshot_premium(
            api_key, api_secret, strategy.ticker,
            strategy.option_type, float(contract["strike_price"]), date.fromisoformat(contract["expiration_date"]), contract["symbol"],
        )
    except AlpacaAuthError:
        deployment.status = "error"
        deployment.last_error = "Alpaca rejected stored credentials"
        db.commit()
        return

    if not premium or premium <= 0:
        _log_event(db, deployment.id, signal_date, "SIGNAL_SUPPRESSED",
                   f"Buy signal met but no live quote available for {contract['symbol']}")
        deployment.last_tick_at = datetime.utcnow()
        db.commit()
        return

    budget = strategy.portfolio.starting_balance * strategy.position_size_pct / 100
    qty = int(budget // (premium * 100))
    if qty < 1:
        _log_event(db, deployment.id, signal_date, "SIGNAL_SUPPRESSED",
                   f"Buy signal met but budget too small for 1 contract (premium ${premium:.2f})")
        deployment.last_tick_at = datetime.utcnow()
        db.commit()
        return

    order_notional = qty * premium * 100
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
        deployment.last_tick_at = datetime.utcnow()
        db.commit()
        return
    if projected_exposure_pct > MAX_TOTAL_EXPOSURE_PCT:
        _log_event(db, deployment.id, signal_date, "ORDER_BLOCKED_CAP",
                   f"Blocked: order would bring total exposure to {projected_exposure_pct:.1f}% of equity, exceeding max of {MAX_TOTAL_EXPOSURE_PCT:.0f}%")
        deployment.last_tick_at = datetime.utcnow()
        db.commit()
        return

    reserved = reserve_order_slot(
        db, deployment.id, trade_date, "BUY", qty,
        contract_symbol=contract["symbol"], strike=float(contract["strike_price"]),
        expiration=date.fromisoformat(contract["expiration_date"]), option_type=strategy.option_type,
    )
    if reserved:
        _log_event(db, deployment.id, signal_date, "BUY_SIGNAL", "Buy conditions met")
        try:
            order = submit_order(api_key, api_secret, conn.is_paper, contract["symbol"], qty, "BUY")
            reserved.alpaca_order_id = order.get("id")
            reserved.status = order.get("status")
            _log_event(db, deployment.id, signal_date, "ORDER_SUBMITTED",
                       f"Submitted buy order for {qty} {strategy.option_type} contract(s) of {contract['symbol']}")
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
