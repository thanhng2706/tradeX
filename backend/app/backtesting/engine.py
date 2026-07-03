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


# ── Main backtest ─────────────────────────────────────────────────────────────

def run_backtest(
    buy_conditions: dict,
    sell_conditions: dict,
    df: pd.DataFrame,
    starting_balance: float,
    position_size_pct: float,
) -> dict[str, Any]:
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

    if in_position and len(df) > 0:
        final_close = float(df["close"].iloc[-1])
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
        "trades": trades,
        "events": events,
        "events_truncated": events_truncated,
    }
