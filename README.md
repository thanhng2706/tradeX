# Tradex

An algorithmic trading platform: build trading strategies with a click-based condition builder, backtest them against years of historical data, evolve them with a genetic optimizer, and deploy the winners to a real Alpaca brokerage account — all with safety guardrails, live position tracking, and an AI assistant grounded in the platform's own data.

## Tech Stack

**Backend:** Python, FastAPI, SQLAlchemy, Alembic, PostgreSQL, scikit-learn
**Frontend:** React, TypeScript, Vite, Tailwind CSS, Zustand, Recharts
**Infra:** Docker Compose
**External APIs:** Alpaca (brokerage execution), Anthropic Claude (AI features), yfinance (market data)

## Features

- **Strategy Builder** — click-based condition builder (no drag-and-drop) over 15 indicators (RSI, SMA, EMA, MACD, Bollinger Bands, ATR, ROC, price/volume, and a trained ML signal), with `<`, `>`, `crosses_above`/`crosses_below` operators.
- **Backtesting Engine** — pure-function simulation over cached historical OHLCV data, reporting return, Sharpe ratio, max drawdown, win rate, and a full trade/event log.
- **Genetic Algorithm Optimizer** — evolves strategy parameters against a chronological train/validation split (not just the training window) so the ranked results reflect what held up on unseen data, not what memorized the past.
- **ML Price-Direction Signal** — a `HistGradientBoostingClassifier` trained on OHLCV-derived features (RSI, MACD histogram, Bollinger %B, ATR, ROC, volume z-score) to predict 5-day price direction, exposed as a normal indicator (`ML_SIGNAL`) usable in any strategy, the optimizer, or live deployment. Evaluated with a chronological (non-shuffled) train/test split and honestly reported held-out accuracy/precision/recall/AUC via `GET /ml/info` — no cherry-picked numbers.
- **Live Brokerage Deployment (Alpaca)** — a scheduler places real (paper) orders once a strategy is deployed, with guardrails: a kill switch, per-order and total-exposure caps, and a reservation pattern that closes a real race condition (concurrent ticks could otherwise double-submit orders).
- **Options Trading** — single-leg calls/puts with synthetic Black–Scholes backtesting (no historical options-chain data source exists) and real order execution against Alpaca's options API.
- **Live Trading Terminal** — a real-time price chart with actual buy/sell markers from filled orders, a live position/indicator status strip, and a chat panel that narrates the strategy's real state — it has no tools and cannot place trades, so the safety story stays structural, not just promised.
- **Aria AI Assistant** — a Claude-powered chat agent that builds strategies from plain English, runs backtests, and explains results in context.
- **Performance Tracking** — live P&L (computed from real fills with proper weighted-average cost basis) and backtested performance are always shown separately, never blended into one number.
- **Research Tools** — stock screener, AI-generated company reports, deep-dive analysis, and watchlists.
- **Strategy Library** — 16 pre-built strategies spanning long-term trend-following, mean reversion, momentum, leveraged, single-stock, and options templates.

## Architecture Notes

- Every indicator (including `ML_SIGNAL`) is computed by one dispatch function (`backend/app/backtesting/engine.py`) shared by backtesting, live scheduler ticks, and the genetic optimizer — adding an indicator makes it usable everywhere at once.
- Real brokerage credentials are encrypted at rest (Fernet) and never leave the backend.
- Live and simulated results are tracked as distinct, clearly labeled data paths throughout the app — a UI surface never presents one as the other.

## Running Locally

Requires Docker.

```bash
cp .env.example .env   # fill in ANTHROPIC_API_KEY and BROKER_ENCRYPTION_KEY
docker compose up
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000

`BROKER_ENCRYPTION_KEY` must be a Fernet key:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

To train the ML signal model (optional — the app runs fine without it, `ML_SIGNAL` just evaluates to NaN until trained):

```bash
docker compose exec backend python -m app.ml.train
```
