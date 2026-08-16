import math
from datetime import timedelta
from typing import Any

import numpy as np
import pandas as pd

from app.backtesting.engine import _compute_series, _ind_key, _eval_rules

RISK_FREE_RATE = 0.045
DEFAULT_DTE = 35
MIN_IV = 0.05
FALLBACK_IV = 0.30


def _norm_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def black_scholes_price(spot: float, strike: float, days_to_expiry: float, iv: float, option_type: str, r: float = RISK_FREE_RATE) -> float:
    """Synthetic option premium — Tradex has no historical options-chain data source
    (yfinance doesn't provide one), so backtests price contracts off the underlying's
    own price history via Black-Scholes instead of real historical quotes."""
    t = max(days_to_expiry, 0) / 365.0
    if t <= 0 or iv <= 0:
        return max(spot - strike, 0.0) if option_type == "call" else max(strike - spot, 0.0)

    d1 = (math.log(spot / strike) + (r + iv ** 2 / 2) * t) / (iv * math.sqrt(t))
    d2 = d1 - iv * math.sqrt(t)
    if option_type == "call":
        price = spot * _norm_cdf(d1) - strike * math.exp(-r * t) * _norm_cdf(d2)
    else:
        price = strike * math.exp(-r * t) * _norm_cdf(-d2) - spot * _norm_cdf(-d1)
    return max(price, 0.01)


def estimate_iv(df: pd.DataFrame, window: int = 30) -> pd.Series:
    """Trailing annualized historical volatility of the underlying, used as an IV proxy."""
    log_ret = np.log(df["close"] / df["close"].shift(1))
    vol = log_ret.rolling(window=window, min_periods=5).std() * np.sqrt(252)
    fallback = vol.mean()
    fallback = fallback if pd.notna(fallback) and fallback > 0 else FALLBACK_IV
    return vol.fillna(fallback).clip(lower=MIN_IV)


def _strike_for(spot: float, distance_pct: float, option_type: str) -> float:
    # Positive distance = OTM for both calls and puts (matches NexusTrade's convention):
    # calls go OTM above spot, puts go OTM below spot.
    sign = 1 if option_type == "call" else -1
    return spot * (1 + sign * distance_pct / 100)


def run_options_backtest(
    buy_conditions: dict,
    sell_conditions: dict,
    df: pd.DataFrame,
    starting_balance: float,
    position_size_pct: float,
    option_type: str,
    strike_distance_pct: float,
    dte_min: int | None,
    dte_max: int | None,
    take_profit_pct: float | None = None,
    stop_loss_pct: float | None = None,
    max_days_held: int | None = None,
) -> dict[str, Any]:
    buy_rules = buy_conditions.get("rules", [])
    sell_rules = sell_conditions.get("rules", [])
    buy_logic = buy_conditions.get("logic", "AND")
    sell_logic = sell_conditions.get("logic", "AND")
    dte_target = ((dte_min or DEFAULT_DTE) + (dte_max or DEFAULT_DTE)) / 2

    ind_series: dict[str, pd.Series] = {}
    for rule in buy_rules + sell_rules:
        for ind, params in [
            (rule["indicator"], rule.get("params", {})),
            (rule.get("right_indicator"), rule.get("right_params") or {}),
        ]:
            if ind and ind not in ("PRICE", "VOLUME"):
                key = _ind_key(ind, params)
                if key not in ind_series:
                    ind_series[key] = _compute_series(ind, params, df)

    iv_series = estimate_iv(df)
    dates = pd.to_datetime(df["date"])

    cash = float(starting_balance)
    in_position = False
    contracts = 0
    entry_premium = entry_cost = strike = 0.0
    entry_date = expiration_date = None
    wins = losses = 0
    equity_curve: list[dict] = []
    benchmark_equity_curve: list[dict] = []
    bh_shares: float | None = None  # buy-and-hold shares of the underlying, sized once on the first row
    trades: list[dict] = []
    events: list[dict] = []
    prev_buy_signal = False
    prev_sell_signal = False

    for i in range(len(df)):
        row = df.iloc[i]
        close = float(row["close"])
        volume = float(row["volume"])
        date_str = str(row["date"])
        today = dates.iloc[i]

        ind_row = {k: float(s.iloc[i]) for k, s in ind_series.items()}
        ind_row_prev = {k: float(s.iloc[i - 1]) for k, s in ind_series.items()} if i > 0 else None
        prev_close = float(df["close"].iloc[i - 1]) if i > 0 else None
        prev_volume = float(df["volume"].iloc[i - 1]) if i > 0 else None

        buy_signal = _eval_rules(buy_rules, buy_logic, ind_row, ind_row_prev, close, volume, prev_close, prev_volume)
        sell_signal = _eval_rules(sell_rules, sell_logic, ind_row, ind_row_prev, close, volume, prev_close, prev_volume)

        if buy_signal and not prev_buy_signal:
            if in_position:
                events.append({"date": date_str, "type": "SIGNAL_SUPPRESSED",
                               "message": "Buy signal triggered but a position is already open"})
            else:
                events.append({"date": date_str, "type": "BUY_SIGNAL", "message": "Buy conditions met"})
        if sell_signal and not prev_sell_signal:
            if not in_position:
                events.append({"date": date_str, "type": "SIGNAL_SUPPRESSED",
                               "message": "Sell signal triggered but no position is held"})
            else:
                events.append({"date": date_str, "type": "SELL_SIGNAL", "message": "Sell conditions met"})
        prev_buy_signal = buy_signal
        prev_sell_signal = sell_signal

        if buy_signal and not in_position:
            strike_price = _strike_for(close, strike_distance_pct, option_type)
            expiry = today + timedelta(days=dte_target)
            iv = float(iv_series.iloc[i])
            premium = black_scholes_price(close, strike_price, dte_target, iv, option_type)
            budget = cash * position_size_pct / 100
            qty = int(budget // (premium * 100))
            if qty < 1:
                events.append({"date": date_str, "type": "SIGNAL_SUPPRESSED",
                               "message": f"Buy signal met but budget too small for 1 contract (premium ${premium:.2f})"})
            else:
                cost = qty * premium * 100
                cash -= cost
                in_position = True
                contracts = qty
                entry_premium = premium
                entry_cost = cost
                strike = strike_price
                entry_date = today
                expiration_date = expiry
                trades.append({"date": date_str, "action": "BUY", "option_type": option_type,
                               "strike": round(strike_price, 2), "expiration": str(expiry.date()),
                               "premium": round(premium, 2), "contracts": qty, "value": round(cost, 2)})
                events.append({"date": date_str, "type": "ORDER_FILLED",
                               "message": f"Opened {qty} {option_type} contract(s) @ ${strike_price:.2f} strike, "
                                          f"exp {expiry.date()}, premium ${premium:.2f} (${cost:,.2f})"})

        current_value = 0.0
        if in_position:
            dte_remaining = (expiration_date - today).days
            iv = float(iv_series.iloc[i])
            current_premium = black_scholes_price(close, strike, dte_remaining, iv, option_type)
            current_value = contracts * current_premium * 100
            pnl_pct = (current_premium - entry_premium) / entry_premium * 100
            days_held = (today - entry_date).days

            exit_reason = None
            if dte_remaining <= 0:
                exit_reason = "EXPIRED"
            elif take_profit_pct is not None and pnl_pct >= take_profit_pct:
                exit_reason = "TAKE_PROFIT"
            elif stop_loss_pct is not None and pnl_pct <= -abs(stop_loss_pct):
                exit_reason = "STOP_LOSS"
            elif max_days_held is not None and days_held >= max_days_held:
                exit_reason = "MAX_DAYS_HELD"
            elif sell_signal:
                exit_reason = "SELL_SIGNAL"

            if exit_reason:
                proceeds = current_value
                pnl = proceeds - entry_cost
                wins += 1 if pnl >= 0 else 0
                losses += 1 if pnl < 0 else 0
                cash += proceeds
                trades.append({"date": date_str, "action": "SELL", "option_type": option_type,
                               "strike": round(strike, 2), "expiration": str(expiration_date.date()),
                               "premium": round(current_premium, 2), "contracts": contracts,
                               "value": round(proceeds, 2), "pnl": round(pnl, 2), "reason": exit_reason})
                events.append({"date": date_str, "type": "ORDER_FILLED",
                               "message": f"Closed {contracts} {option_type} contract(s) ({exit_reason}) @ "
                                          f"${current_premium:.2f} ({'+' if pnl >= 0 else ''}${pnl:,.2f} P&L)"})
                in_position = False
                contracts = 0
                current_value = 0.0

        equity_curve.append({"date": date_str, "value": round(cash + current_value, 2)})

        if bh_shares is None:
            bh_shares = starting_balance / close
        benchmark_equity_curve.append({"date": date_str, "value": round(bh_shares * close, 2)})

    if in_position and len(df) > 0:
        final_close = float(df["close"].iloc[-1])
        final_date_str = str(df["date"].iloc[-1])
        final_today = dates.iloc[-1]
        dte_remaining = max((expiration_date - final_today).days, 0)
        iv = float(iv_series.iloc[-1])
        final_premium = black_scholes_price(final_close, strike, dte_remaining, iv, option_type)
        proceeds = contracts * final_premium * 100
        pnl = proceeds - entry_cost
        wins += 1 if pnl >= 0 else 0
        losses += 1 if pnl < 0 else 0
        cash += proceeds
        trades.append({"date": final_date_str, "action": "SELL (end)", "option_type": option_type,
                       "strike": round(strike, 2), "expiration": str(expiration_date.date()),
                       "premium": round(final_premium, 2), "contracts": contracts,
                       "value": round(proceeds, 2), "pnl": round(pnl, 2)})
        events.append({"date": final_date_str, "type": "ORDER_FILLED",
                       "message": f"Position closed at end of backtest: {contracts} {option_type} contract(s) @ "
                                  f"${final_premium:.2f} ({'+' if pnl >= 0 else ''}${pnl:,.2f} P&L)"})
        if equity_curve:
            equity_curve[-1]["value"] = round(cash, 2)

    MAX_EVENTS = 500
    events_truncated = len(events) > MAX_EVENTS
    if events_truncated:
        events = events[-MAX_EVENTS:]

    final_balance = round(cash, 2)
    total_return_pct = round((cash - starting_balance) / starting_balance * 100, 2)
    years = len(df) / 252
    annualized_return_pct = round(((cash / starting_balance) ** (1 / years) - 1) * 100, 2) if years > 0 and cash > 0 else 0.0

    values = pd.Series([e["value"] for e in equity_curve])
    daily_ret = values.pct_change().dropna()
    sharpe_ratio = round(float(daily_ret.mean() / daily_ret.std() * np.sqrt(252)) if daily_ret.std() > 0 else 0.0, 3)
    max_drawdown_pct = round(float(((values - values.cummax()) / values.cummax()).min() * 100), 2)

    num_trades = wins + losses
    win_rate = round(wins / num_trades * 100, 2) if num_trades > 0 else 0.0

    benchmark_return_pct = (
        round((benchmark_equity_curve[-1]["value"] - starting_balance) / starting_balance * 100, 2)
        if benchmark_equity_curve else 0.0
    )

    if len(df) > 0:
        events.append({"date": str(df["date"].iloc[-1]), "type": "BACKTEST_COMPLETE",
                       "message": f"Options backtest complete — {num_trades} trade{'s' if num_trades != 1 else ''}, "
                                  f"{win_rate:.2f}% win rate, {total_return_pct:+.2f}% return "
                                  f"(simulated pricing — see note)"})

    return {
        "final_balance": final_balance,
        "total_return_pct": total_return_pct,
        "annualized_return_pct": annualized_return_pct,
        "sharpe_ratio": sharpe_ratio,
        "max_drawdown_pct": max_drawdown_pct,
        "win_rate": win_rate,
        "num_trades": num_trades,
        "equity_curve": equity_curve,
        "benchmark_equity_curve": benchmark_equity_curve,
        "benchmark_return_pct": benchmark_return_pct,
        "trades": trades,
        "events": events,
        "events_truncated": events_truncated,
    }
