from datetime import date, timedelta
import pandas as pd
from sqlalchemy.orm import Session
from app.backtesting.data import get_price_data
from app.backtesting.engine import run_backtest
from app.models import PaperTrade, Strategy


def get_paper_status(paper_trade: PaperTrade, strategy: Strategy, db: Session) -> dict:
    today = date.today()
    # Fetch back at least 5 days so we always have a current price reference.
    # Use today+1 as end so yfinance (exclusive end) includes today's data when available.
    fetch_start = min(paper_trade.started_at, today - timedelta(days=5))
    fetch_end = today + timedelta(days=1)

    try:
        df = get_price_data(strategy.ticker, fetch_start, fetch_end, db)
    except ValueError:
        return {"error": "No price data available for this ticker."}

    if df.empty:
        return {"error": "No price data available yet. Try again after market hours."}

    current_price = float(df["close"].iloc[-1])

    # Filter DataFrame to the actual paper trading period
    sim_df = df[df["date"] >= paper_trade.started_at].reset_index(drop=True)

    if len(sim_df) < 2:
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
        df=sim_df,
        starting_balance=strategy.portfolio.starting_balance,
        position_size_pct=strategy.position_size_pct,
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
        "days_active": len(sim_df),
    }
