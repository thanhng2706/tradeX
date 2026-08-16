from datetime import date, timedelta
import pandas as pd
from sqlalchemy.orm import Session
from app.backtesting.data import get_price_data
from app.backtesting.engine import run_backtest
from app.models import PaperTrade, Strategy

# Same lookback used by the real Alpaca scheduler (app/broker/scheduler.py) — long enough
# for any indicator period (e.g. SMA/EMA/RSI(200)) to be non-NaN by the time simulated
# trading actually starts at started_at.
LOOKBACK_DAYS = 400


def get_paper_status(paper_trade: PaperTrade, strategy: Strategy, db: Session) -> dict:
    today = date.today()
    # Fetch enough history BEFORE started_at to warm up indicators, not just a few days
    # for a current-price reference — a strategy using RSI(40)/SMA(200)/etc. would
    # otherwise silently never fire for weeks after activation.
    fetch_start = paper_trade.started_at - timedelta(days=LOOKBACK_DAYS)
    fetch_end = today + timedelta(days=1)

    try:
        df = get_price_data(strategy.ticker, fetch_start, fetch_end, db)
    except ValueError:
        return {"error": "No price data available for this ticker."}

    if df.empty:
        return {"error": "No price data available yet. Try again after market hours."}

    current_price = float(df["close"].iloc[-1])

    # Just for the early-exit check below — has any real trading day passed since activation?
    live_days = df[df["date"] >= paper_trade.started_at]

    if len(live_days) < 1:
        # Started today or no trading days have passed yet
        return {
            "total_return_pct": 0.0,
            "final_balance": strategy.portfolio.starting_balance,
            "starting_balance": strategy.portfolio.starting_balance,
            "num_trades": 0,
            "win_rate": 0.0,
            "sharpe_ratio": 0.0,
            "max_drawdown_pct": 0.0,
            "current_position": "OUT",
            "last_buy_price": 0.0,
            "current_price": current_price,
            "unrealized_pct": 0.0,
            "recent_trades": [],
            "equity_curve": [],
            "events": [],
            "days_active": 0,
        }

    result = run_backtest(
        buy_conditions=strategy.buy_conditions,
        sell_conditions=strategy.sell_conditions,
        df=df,
        starting_balance=strategy.portfolio.starting_balance,
        position_size_pct=strategy.position_size_pct,
        sim_start_date=paper_trade.started_at,
        close_at_end=False,
    )

    # Determine current position from trade log
    in_position = False
    last_buy_price = 0.0
    for trade in result["trades"]:
        if trade["action"] == "BUY":
            in_position = True
            last_buy_price = trade["price"]
        elif "SELL" in trade["action"]:
            in_position = False
            last_buy_price = 0.0

    unrealized_pct = 0.0
    if in_position and last_buy_price > 0:
        unrealized_pct = round((current_price - last_buy_price) / last_buy_price * 100, 2)

    return {
        "total_return_pct": result["total_return_pct"],
        "final_balance": result["final_balance"],
        "starting_balance": strategy.portfolio.starting_balance,
        "num_trades": result["num_trades"],
        "win_rate": result["win_rate"],
        "sharpe_ratio": result["sharpe_ratio"],
        "max_drawdown_pct": result["max_drawdown_pct"],
        "current_position": "IN" if in_position else "OUT",
        "last_buy_price": round(last_buy_price, 2),
        "current_price": round(current_price, 2),
        "unrealized_pct": unrealized_pct,
        "recent_trades": result["trades"][-10:],
        "equity_curve": result["equity_curve"],
        "events": result["events"][-50:],
        "days_active": len(result["equity_curve"]),
    }
