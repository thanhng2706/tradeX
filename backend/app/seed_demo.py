"""One-off script to seed a safe public-demo account.

Not part of any request path. Run once after deploying:
    railway run python -m app.seed_demo

Creates a demo user + portfolio with a few library strategies already
backtested, so the app isn't empty on first view. Deliberately creates
NO BrokerConnection — the demo account never has real (even paper)
brokerage access, so a public viewer can't pause/close real positions.
Idempotent: safe to re-run, skips anything that already exists.
"""
from datetime import date, timedelta

from app.database import SessionLocal
from app.models import User, Portfolio, Strategy, BacktestResult
from app.auth.service import hash_password
from app.library.data import LIBRARY_MAP
from app.backtesting.data import get_price_data
from app.backtesting.engine import run_backtest

DEMO_EMAIL = "demo@tradex.app"
DEMO_PASSWORD = "TradexDemo2026!"
DEMO_STRATEGY_IDS = ["spy-golden-cross", "spy-rsi-reversal", "nvda-ai-momentum", "spy-ml-confidence"]


def main():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == DEMO_EMAIL).first()
        if not user:
            user = User(email=DEMO_EMAIL, hashed_password=hash_password(DEMO_PASSWORD))
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Created demo user {DEMO_EMAIL}")
        else:
            print(f"Demo user {DEMO_EMAIL} already exists")

        portfolio = db.query(Portfolio).filter(Portfolio.user_id == user.id).first()
        if not portfolio:
            portfolio = Portfolio(name="Demo Portfolio", description="Seeded for public viewing", starting_balance=10000.0, user_id=user.id)
            db.add(portfolio)
            db.commit()
            db.refresh(portfolio)
            print("Created demo portfolio")
        else:
            print("Demo portfolio already exists")

        end = date.today()
        start = end - timedelta(days=365 * 3)

        for lib_id in DEMO_STRATEGY_IDS:
            template = LIBRARY_MAP[lib_id]
            existing = db.query(Strategy).filter(Strategy.portfolio_id == portfolio.id, Strategy.name == template["name"]).first()
            if existing:
                print(f"  {template['name']} already seeded, skipping")
                continue

            strategy = Strategy(
                name=template["name"],
                description=template["description"],
                ticker=template["ticker"],
                buy_conditions=template["buy_conditions"],
                sell_conditions=template["sell_conditions"],
                position_size_pct=template["position_size_pct"],
                portfolio_id=portfolio.id,
                asset_type=template.get("asset_type", "equity"),
                option_type=template.get("option_type"),
                strike_distance_pct=template.get("strike_distance_pct"),
                dte_min=template.get("dte_min"),
                dte_max=template.get("dte_max"),
                take_profit_pct=template.get("take_profit_pct"),
                stop_loss_pct=template.get("stop_loss_pct"),
                max_days_held=template.get("max_days_held"),
            )
            db.add(strategy)
            db.commit()
            db.refresh(strategy)

            try:
                df = get_price_data(strategy.ticker, start, end, db)
                results = run_backtest(strategy.buy_conditions, strategy.sell_conditions, df, portfolio.starting_balance, strategy.position_size_pct)
                bt = BacktestResult(
                    strategy_id=strategy.id,
                    start_date=start,
                    end_date=end,
                    starting_balance=portfolio.starting_balance,
                    final_balance=results["final_balance"],
                    total_return_pct=results["total_return_pct"],
                    annualized_return_pct=results["annualized_return_pct"],
                    sharpe_ratio=results["sharpe_ratio"],
                    max_drawdown_pct=results["max_drawdown_pct"],
                    win_rate=results["win_rate"],
                    num_trades=results["num_trades"],
                    equity_curve=results["equity_curve"],
                    benchmark_equity_curve=results.get("benchmark_equity_curve"),
                    benchmark_return_pct=results.get("benchmark_return_pct"),
                    trades=results["trades"],
                    events=results["events"],
                    events_truncated=results["events_truncated"],
                )
                db.add(bt)
                db.commit()
                print(f"  Seeded {template['name']} with a real backtest ({results['total_return_pct']:.1f}% return)")
            except Exception as e:
                print(f"  Backtest failed for {template['name']}: {e} (strategy created without a backtest)")

        print(f"\nDemo login: {DEMO_EMAIL} / {DEMO_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
