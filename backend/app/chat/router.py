import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from anthropic import Anthropic

from app.config import settings
from app.database import get_db
from app.auth.router import get_current_user
from app.models import User
from app.backtesting.data import get_price_data
from app.backtesting.engine import run_backtest as _run_backtest

router = APIRouter(tags=["chat"])
_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


SYSTEM_PROMPT = """You are Aria, an intelligent AI trading assistant for Tradex — an algorithmic trading platform.

You help users:
1. Build trading strategies from natural language descriptions
2. Run backtests to test strategy historical performance
3. Explain trading concepts, indicators, and backtest results
4. Suggest improvements to strategies

Available indicators and their params:
- RSI: {"period": 14} — oscillates 0-100, <30 oversold, >70 overbought
- SMA: {"period": 20} — simple moving average
- EMA: {"period": 20} — exponential moving average (reacts faster than SMA)
- MACD_LINE: {"fast": 12, "slow": 26, "signal": 9}
- MACD_SIGNAL: {"fast": 12, "slow": 26, "signal": 9}
- MACD_HIST: {"fast": 12, "slow": 26, "signal": 9} — MACD line minus signal line
- BB_UPPER: {"period": 20, "std_dev": 2.0} — Bollinger upper band
- BB_LOWER: {"period": 20, "std_dev": 2.0} — Bollinger lower band
- BB_MID: {"period": 20, "std_dev": 2.0} — Bollinger middle band (SMA)
- ATR: {"period": 14} — average true range (volatility)
- ROC: {"period": 10} — rate of change percentage
- PRICE: {} — current closing price (no params)
- VOLUME: {} — trading volume (no params)
- ML_SIGNAL: {} — trained classifier's predicted probability (0-1) price is up in 5 trading days; >0.65 is fairly confident bullish, <0.35 fairly confident bearish

Rule format examples:
- Fixed value: {"indicator": "RSI", "params": {"period": 14}, "operator": "<", "value": 30, "right_indicator": null, "right_params": null}
- Indicator vs indicator: {"indicator": "SMA", "params": {"period": 50}, "operator": "crosses_above", "value": null, "right_indicator": "SMA", "right_params": {"period": 200}}

Operators: "<", ">", "<=", ">=", "crosses_above", "crosses_below"

Guidelines:
- When user asks to build a strategy, use build_strategy tool. Always include both buy and sell conditions.
- When user asks to backtest, use run_backtest tool. Default to 2 years if no dates specified.
- After building a strategy, proactively offer to run a backtest on it.
- After a backtest, interpret results clearly: explain what Sharpe ratio, max drawdown, and win rate mean in plain English.
- For general trading questions, answer directly without tools.
- Be concise, educational, and conversational."""

TOOLS = [
    {
        "name": "build_strategy",
        "description": "Build a complete trading strategy with buy and sell conditions from the user's description. Use this whenever the user wants to create a strategy.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Short descriptive strategy name (e.g. 'RSI Reversal', 'Golden Cross')"},
                "ticker": {"type": "string", "description": "Stock/ETF ticker symbol (e.g. SPY, QQQ, AAPL)"},
                "description": {"type": "string", "description": "One-sentence description of the strategy logic"},
                "position_size_pct": {"type": "number", "description": "Position size as % of portfolio per trade (1-100)"},
                "buy_conditions": {
                    "type": "object",
                    "properties": {
                        "logic": {"type": "string", "enum": ["AND", "OR"]},
                        "rules": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "indicator": {"type": "string"},
                                    "params": {"type": "object"},
                                    "operator": {"type": "string"},
                                    "value": {},
                                    "right_indicator": {},
                                    "right_params": {}
                                },
                                "required": ["indicator", "params", "operator"]
                            }
                        }
                    },
                    "required": ["logic", "rules"]
                },
                "sell_conditions": {
                    "type": "object",
                    "properties": {
                        "logic": {"type": "string", "enum": ["AND", "OR"]},
                        "rules": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "indicator": {"type": "string"},
                                    "params": {"type": "object"},
                                    "operator": {"type": "string"},
                                    "value": {},
                                    "right_indicator": {},
                                    "right_params": {}
                                },
                                "required": ["indicator", "params", "operator"]
                            }
                        }
                    },
                    "required": ["logic", "rules"]
                }
            },
            "required": ["name", "ticker", "position_size_pct", "buy_conditions", "sell_conditions"]
        }
    },
    {
        "name": "run_backtest",
        "description": "Run a historical backtest on a trading strategy to see how it would have performed. Use this when the user asks to test or backtest a strategy.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string"},
                "buy_conditions": {"type": "object"},
                "sell_conditions": {"type": "object"},
                "position_size_pct": {"type": "number"},
                "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                "starting_balance": {"type": "number", "description": "Starting balance in USD, default 10000"}
            },
            "required": ["ticker", "buy_conditions", "sell_conditions", "position_size_pct", "start_date", "end_date"]
        }
    }
]


def _execute_tool(name: str, input_data: dict, db: Session) -> tuple[dict, dict | None]:
    if name == "build_strategy":
        data = {
            "name": input_data["name"],
            "ticker": input_data["ticker"].upper(),
            "description": input_data.get("description", ""),
            "position_size_pct": float(input_data["position_size_pct"]),
            "buy_conditions": input_data["buy_conditions"],
            "sell_conditions": input_data["sell_conditions"],
        }
        return {"status": "success", "strategy": data}, {"type": "strategy_ready", "data": data}

    if name == "run_backtest":
        try:
            ticker = input_data["ticker"].upper()
            start = date.fromisoformat(input_data["start_date"])
            end = date.fromisoformat(input_data["end_date"])
            balance = float(input_data.get("starting_balance") or 10000)

            df = get_price_data(ticker, start, end + timedelta(days=1), db)
            if df.empty:
                return {"status": "error", "error": "No price data available for that ticker/date range"}, None

            sim = df[(df["date"] >= start) & (df["date"] <= end)].reset_index(drop=True)
            if len(sim) < 5:
                return {"status": "error", "error": "Not enough trading days in that date range"}, None

            result = _run_backtest(
                input_data["buy_conditions"],
                input_data["sell_conditions"],
                sim,
                balance,
                float(input_data["position_size_pct"]),
            )
            metrics = {k: v for k, v in result.items() if k not in ("equity_curve", "trades")}
            metrics.update({"ticker": ticker, "start_date": str(start), "end_date": str(end), "starting_balance": balance})
            return {"status": "success", "metrics": metrics}, {"type": "backtest_result", "data": metrics}

        except Exception as e:
            return {"status": "error", "error": str(e)}, None

    return {"status": "error", "error": f"Unknown tool: {name}"}, None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@router.post("/chat")
def chat(
    body: ChatRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today = date.today()
    two_years_ago = date(today.year - 2, today.month, today.day)
    # Inject today's date into system prompt so Claude can compute default date ranges
    system = SYSTEM_PROMPT + f"\n\nToday's date: {today.isoformat()}. Default backtest: {two_years_ago.isoformat()} to {today.isoformat()}."

    claude_messages = [{"role": m.role, "content": m.content} for m in body.messages]
    actions: list[dict] = []
    client = _get_client()

    for _ in range(5):
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=system,
            tools=TOOLS,
            messages=claude_messages,
        )

        if response.stop_reason == "end_turn":
            text = "".join(b.text for b in response.content if hasattr(b, "text"))
            return {"message": text, "actions": actions}

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result, act = _execute_tool(block.name, block.input, db)
                    if act:
                        actions.append(act)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })
            claude_messages.append({"role": "assistant", "content": response.content})
            claude_messages.append({"role": "user", "content": tool_results})
            continue

        break

    return {"message": "I wasn't able to complete that request. Please try again.", "actions": actions}
