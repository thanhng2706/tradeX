from datetime import date
import numpy as np
import pandas as pd
from typing import Any


# ── Indicator computations ────────────────────────────────────────────────────

def _rsi(close: pd.Series, period: int) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _sma(close: pd.Series, period: int) -> pd.Series:
    return close.rolling(window=period).mean()


def _ema(close: pd.Series, period: int) -> pd.Series:
    return close.ewm(span=period, adjust=False).mean()


def _macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def _bollinger(close: pd.Series, period: int = 20, std_dev: float = 2.0):
    mid = close.rolling(window=period).mean()
    std = close.rolling(window=period).std()
    upper = mid + std_dev * std
    lower = mid - std_dev * std
    return upper, mid, lower


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low - close.shift()).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(com=period - 1, min_periods=period).mean()


def _roc(close: pd.Series, period: int = 10) -> pd.Series:
    return (close - close.shift(period)) / close.shift(period) * 100


# ── Indicator key & compute ───────────────────────────────────────────────────

def _ind_key(indicator: str, params: dict) -> str:
    if not params:
        return indicator
    return f"{indicator}_" + "_".join(str(params[k]) for k in sorted(params))


def _compute_series(indicator: str, params: dict, df: pd.DataFrame) -> pd.Series:
    close = df["close"]
    if indicator == "RSI":
        return _rsi(close, int(params.get("period", 14)))
    elif indicator == "SMA":
        return _sma(close, int(params.get("period", 20)))
    elif indicator == "EMA":
        return _ema(close, int(params.get("period", 20)))
    elif indicator == "MACD_LINE":
        line, _, _ = _macd(close, int(params.get("fast", 12)), int(params.get("slow", 26)), int(params.get("signal", 9)))
        return line
    elif indicator == "MACD_SIGNAL":
        _, sig, _ = _macd(close, int(params.get("fast", 12)), int(params.get("slow", 26)), int(params.get("signal", 9)))
        return sig
    elif indicator == "MACD_HIST":
        _, _, hist = _macd(close, int(params.get("fast", 12)), int(params.get("slow", 26)), int(params.get("signal", 9)))
        return hist
    elif indicator == "BB_UPPER":
        upper, _, _ = _bollinger(close, int(params.get("period", 20)), float(params.get("std_dev", 2.0)))
        return upper
    elif indicator == "BB_LOWER":
        _, _, lower = _bollinger(close, int(params.get("period", 20)), float(params.get("std_dev", 2.0)))
        return lower
    elif indicator == "BB_MID":
        _, mid, _ = _bollinger(close, int(params.get("period", 20)), float(params.get("std_dev", 2.0)))
        return mid
    elif indicator == "ATR":
        return _atr(df["high"], df["low"], close, int(params.get("period", 14)))
    elif indicator == "ROC":
        return _roc(close, int(params.get("period", 10)))
    elif indicator == "PRICE":
        return close
    elif indicator == "VOLUME":
        return df["volume"].astype(float)
    elif indicator == "ML_SIGNAL":
        from app.ml.predict import get_ml_signal
        return get_ml_signal(df)
    return pd.Series([np.nan] * len(df), index=df.index)


# ── Rule evaluation ───────────────────────────────────────────────────────────

def _get_val(indicator: str, params: dict, ind_row: dict, close: float, volume: float) -> float | None:
    if indicator == "PRICE":
        return close
    if indicator == "VOLUME":
        return volume
    key = _ind_key(indicator, params)
    v = ind_row.get(key)
    return None if v is None or (isinstance(v, float) and np.isnan(v)) else v


def _eval_rules(
    rules: list,
    logic: str,
    ind_row: dict,
    ind_row_prev: dict | None,
    close: float,
    volume: float,
    prev_close: float | None = None,
    prev_volume: float | None = None,
) -> bool:
    if not rules:
        return False
    results = []
    for rule in rules:
        left_ind = rule["indicator"]
        left_params = rule.get("params", {})
        op = rule["operator"]
        right_ind = rule.get("right_indicator")
        right_params = rule.get("right_params") or {}
        val = rule.get("value")

        left = _get_val(left_ind, left_params, ind_row, close, volume)
        if left is None:
            results.append(False)
            continue

        # Determine right side
        if right_ind:
            right = _get_val(right_ind, right_params, ind_row, close, volume)
            if right is None:
                results.append(False)
                continue
        else:
            right = val

        # Crosses operators need previous-row values
        if op in ("crosses_above", "crosses_below"):
            if ind_row_prev is None:
                results.append(False)
                continue
            prev_left = _get_val(left_ind, left_params, ind_row_prev, prev_close or close, prev_volume or volume)
            if right_ind:
                prev_right = _get_val(right_ind, right_params, ind_row_prev, prev_close or close, prev_volume or volume)
            else:
                prev_right = right  # fixed value unchanged
            if prev_left is None or prev_right is None:
                results.append(False)
                continue
            if op == "crosses_above":
                results.append(left > right and prev_left <= prev_right)
            else:
                results.append(left < right and prev_left >= prev_right)
            continue

        # Standard comparators
        if op == "<":
            results.append(left < right)
        elif op == ">":
            results.append(left > right)
        elif op == "<=":
            results.append(left <= right)
        elif op == ">=":
            results.append(left >= right)
        # legacy operators kept for backward compatibility
        elif op == "price_above":
            results.append(close > left)
        elif op == "price_below":
            results.append(close < left)
        else:
            results.append(False)

    return all(results) if logic == "AND" else any(results)


def _eval_rules_detail(
    rules: list,
    ind_row: dict,
    close: float,
    volume: float,
) -> list[dict]:
    """Same per-rule evaluation as _eval_rules, but returns the actual left/right
    values and per-rule pass/fail instead of collapsing to one boolean — used to
    show "what is the bot currently watching" (e.g. RSI is 42, needs < 30)."""
    detail = []
    for rule in rules:
        left_ind = rule["indicator"]
        left_params = rule.get("params", {})
        op = rule["operator"]
        right_ind = rule.get("right_indicator")
        right_params = rule.get("right_params") or {}
        val = rule.get("value")

        left = _get_val(left_ind, left_params, ind_row, close, volume)
        right = _get_val(right_ind, right_params, ind_row, close, volume) if right_ind else val

        display_right_ind = right_ind
        display_right = right
        passed = False
        if op in ("price_above", "price_below"):
            # Legacy operators compare `close` against `left` directly (see
            # _eval_rules) — mirror that exactly, and display PRICE as the
            # right-hand side since that's what's actually being compared.
            display_right_ind = "PRICE"
            display_right = close
            if left is not None:
                passed = close > left if op == "price_above" else close < left
        elif left is not None and right is not None:
            if op == "<":
                passed = left < right
            elif op == ">":
                passed = left > right
            elif op == "<=":
                passed = left <= right
            elif op == ">=":
                passed = left >= right
            # crosses_above/crosses_below need the previous row too — this
            # summary intentionally shows the current-row comparison only,
            # since "what's it watching right now" is about levels, not edges.

        detail.append({
            "indicator": left_ind,
            "params": left_params,
            "operator": op,
            "right_indicator": display_right_ind,
            "left_value": left,
            "right_value": display_right,
            "passed": passed,
        })
    return detail


def evaluate_latest_signal_detail(buy_conditions: dict, sell_conditions: dict, df: pd.DataFrame) -> dict:
    """Like evaluate_latest_signal, but also returns a per-rule breakdown of
    current values vs thresholds for both buy and sell conditions, for display
    on the Live Trading Terminal's status strip."""
    buy_rules = buy_conditions.get("rules", [])
    sell_rules = sell_conditions.get("rules", [])

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

    i = len(df) - 1
    close = float(df["close"].iloc[i])
    volume = float(df["volume"].iloc[i])
    ind_row = {k: float(s.iloc[i]) for k, s in ind_series.items()}

    return {
        "date": str(df["date"].iloc[i]),
        "close": close,
        "buy_rules": _eval_rules_detail(buy_rules, ind_row, close, volume),
        "sell_rules": _eval_rules_detail(sell_rules, ind_row, close, volume),
    }


def evaluate_latest_signal(buy_conditions: dict, sell_conditions: dict, df: pd.DataFrame) -> dict:
    """Evaluate buy/sell rules for only the most recent row of df.

    Unlike run_backtest, this doesn't simulate cash/position bookkeeping across the
    whole window — it's for live scheduler ticks, where "am I in a position" should
    come from the real broker, not a replayed history. df must include enough
    lookback before the last row for indicators (e.g. SMA(200)) to be non-NaN there.
    """
    buy_rules = buy_conditions.get("rules", [])
    sell_rules = sell_conditions.get("rules", [])
    buy_logic = buy_conditions.get("logic", "AND")
    sell_logic = sell_conditions.get("logic", "AND")

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

    i = len(df) - 1
    close = float(df["close"].iloc[i])
    volume = float(df["volume"].iloc[i])
    ind_row = {k: float(s.iloc[i]) for k, s in ind_series.items()}
    ind_row_prev = {k: float(s.iloc[i - 1]) for k, s in ind_series.items()} if i > 0 else None
    prev_close = float(df["close"].iloc[i - 1]) if i > 0 else None
    prev_volume = float(df["volume"].iloc[i - 1]) if i > 0 else None

    buy_signal = _eval_rules(buy_rules, buy_logic, ind_row, ind_row_prev, close, volume, prev_close, prev_volume)
    sell_signal = _eval_rules(sell_rules, sell_logic, ind_row, ind_row_prev, close, volume, prev_close, prev_volume)

    return {
        "date": str(df["date"].iloc[i]),
        "close": close,
        "buy_signal": buy_signal,
        "sell_signal": sell_signal,
    }


# ── Main backtest ─────────────────────────────────────────────────────────────

def run_backtest(
    buy_conditions: dict,
    sell_conditions: dict,
    df: pd.DataFrame,
    starting_balance: float,
    position_size_pct: float,
    sim_start_date: date | None = None,
    close_at_end: bool = True,
) -> dict[str, Any]:
    """`sim_start_date` lets a caller pass extra history BEFORE the date they actually
    care about simulating, so indicators with a long lookback (RSI(40), SMA(200), ...)
    are already warmed up by the time trading starts — without that buffer, the first
    N rows of any window are silently NaN and can never trigger a signal. Rows before
    `sim_start_date` still feed the indicator series and rising-edge tracking, they just
    never execute trades or get recorded into events/equity_curve. Backtesting and the
    Optimizer never pass this, so their behavior is completely unchanged.

    `close_at_end=False` skips the forced end-of-window liquidation below — appropriate
    for a caller (paper trading) where the last row is just "today," not an actual
    ending, so a still-open position should be reported as open, not force-sold."""
    buy_rules = buy_conditions.get("rules", [])
    sell_rules = sell_conditions.get("rules", [])
    buy_logic = buy_conditions.get("logic", "AND")
    sell_logic = sell_conditions.get("logic", "AND")

    # Precompute all needed indicator series (left + right sides)
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

    cash = float(starting_balance)
    shares = 0.0
    in_position = False
    entry_price = 0.0
    wins = losses = 0
    equity_curve: list[dict] = []
    benchmark_equity_curve: list[dict] = []
    bh_shares: float | None = None  # buy-and-hold shares, sized once on the first simulated row
    trades: list[dict] = []
    events: list[dict] = []
    prev_buy_signal = False
    prev_sell_signal = False

    for i in range(len(df)):
        row = df.iloc[i]
        close = float(row["close"])
        volume = float(row["volume"])
        date_str = str(row["date"])

        ind_row = {k: float(s.iloc[i]) for k, s in ind_series.items()}
        ind_row_prev = {k: float(s.iloc[i - 1]) for k, s in ind_series.items()} if i > 0 else None
        prev_close = float(df["close"].iloc[i - 1]) if i > 0 else None
        prev_volume = float(df["volume"].iloc[i - 1]) if i > 0 else None

        buy_signal = _eval_rules(buy_rules, buy_logic, ind_row, ind_row_prev, close, volume, prev_close, prev_volume)
        sell_signal = _eval_rules(sell_rules, sell_logic, ind_row, ind_row_prev, close, volume, prev_close, prev_volume)

        if sim_start_date is not None and row["date"] < sim_start_date:
            # Warmup-only row: keeps rising-edge tracking continuous across the boundary,
            # but no trade, event, or equity_curve point gets recorded for it.
            prev_buy_signal = buy_signal
            prev_sell_signal = sell_signal
            continue

        # Signal/guard events only fire on the rising edge (newly true this bar),
        # otherwise a sticky condition (e.g. "RSI < 30") would emit one event per bar.
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
            total_val = cash + shares * close
            spend = min(total_val * position_size_pct / 100, cash)
            shares = spend / close
            cash -= spend
            in_position = True
            entry_price = close
            trades.append({"date": date_str, "action": "BUY",
                           "price": round(close, 2), "shares": round(shares, 4),
                           "value": round(spend, 2)})
            events.append({"date": date_str, "type": "ORDER_FILLED",
                           "message": f"Bought {shares:.4f} shares @ ${close:.2f} (${spend:,.2f})"})

        if sell_signal and in_position:
            proceeds = shares * close
            pnl = proceeds - shares * entry_price
            wins += 1 if pnl >= 0 else 0
            losses += 1 if pnl < 0 else 0
            cash += proceeds
            trades.append({"date": date_str, "action": "SELL",
                           "price": round(close, 2), "shares": round(shares, 4),
                           "value": round(proceeds, 2), "pnl": round(pnl, 2)})
            events.append({"date": date_str, "type": "ORDER_FILLED",
                           "message": f"Sold {shares:.4f} shares @ ${close:.2f} "
                                      f"({'+' if pnl >= 0 else ''}${pnl:,.2f} P&L)"})
            shares = 0.0
            in_position = False

        equity_curve.append({"date": date_str, "value": round(cash + shares * close, 2)})

        if bh_shares is None:
            bh_shares = starting_balance / close
        benchmark_equity_curve.append({"date": date_str, "value": round(bh_shares * close, 2)})

    final_close = float(df["close"].iloc[-1]) if len(df) > 0 else 0.0

    if in_position and len(df) > 0 and close_at_end:
        final_date = str(df["date"].iloc[-1])
        proceeds = shares * final_close
        pnl = proceeds - shares * entry_price
        wins += 1 if pnl >= 0 else 0
        losses += 1 if pnl < 0 else 0
        cash += proceeds
        trades.append({"date": final_date, "action": "SELL (end)",
                       "price": round(final_close, 2), "shares": round(shares, 4),
                       "value": round(proceeds, 2), "pnl": round(pnl, 2)})
        events.append({"date": final_date, "type": "ORDER_FILLED",
                       "message": f"Position closed at end of backtest: sold {shares:.4f} shares @ "
                                  f"${final_close:.2f} ({'+' if pnl >= 0 else ''}${pnl:,.2f} P&L)"})
        shares = 0.0
        if equity_curve:
            equity_curve[-1]["value"] = round(cash, 2)
    # else (close_at_end=False and still in position): leave it open — the equity_curve's
    # last point was already mark-to-market from the main loop, nothing to adjust here.

    MAX_EVENTS = 500
    events_truncated = len(events) > MAX_EVENTS
    if events_truncated:
        events = events[-MAX_EVENTS:]

    # Mark-to-market: equals `cash` whenever close_at_end already liquidated any open
    # position (shares == 0 by then), and correctly includes a still-open position's
    # current worth when close_at_end=False left one open.
    account_value = cash + shares * final_close
    final_balance = round(account_value, 2)
    total_return_pct = round((account_value - starting_balance) / starting_balance * 100, 2)
    years = len(equity_curve) / 252
    annualized_return_pct = round(((account_value / starting_balance) ** (1 / years) - 1) * 100, 2) if years > 0 and account_value > 0 else 0.0

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
                       "message": f"Backtest complete — {num_trades} trade{'s' if num_trades != 1 else ''}, "
                                  f"{win_rate:.2f}% win rate, {total_return_pct:+.2f}% return"})

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
