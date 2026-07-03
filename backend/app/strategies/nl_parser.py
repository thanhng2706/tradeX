import json
from anthropic import Anthropic
from app.config import settings

client = Anthropic(api_key=settings.anthropic_api_key)

SYSTEM_PROMPT = """You are a trading strategy parser. Convert plain English trading strategies into structured JSON.

Each rule compares a LEFT indicator to either a fixed VALUE or a RIGHT indicator.

Rule format with fixed value:
  {"indicator": "RSI", "params": {"period": 14}, "operator": "<", "value": 30, "right_indicator": null, "right_params": null}

Rule format comparing two indicators (right_indicator set, value null):
  {"indicator": "SMA", "params": {"period": 50}, "operator": "crosses_above", "value": null, "right_indicator": "SMA", "right_params": {"period": 200}}

Supported indicators and their params:
- RSI:         {"period": 14}
- SMA:         {"period": 20}
- EMA:         {"period": 20}
- MACD_LINE:   {"fast": 12, "slow": 26, "signal": 9}
- MACD_SIGNAL: {"fast": 12, "slow": 26, "signal": 9}
- MACD_HIST:   {"fast": 12, "slow": 26, "signal": 9}
- BB_UPPER:    {"period": 20, "std_dev": 2.0}
- BB_LOWER:    {"period": 20, "std_dev": 2.0}
- BB_MID:      {"period": 20, "std_dev": 2.0}
- ATR:         {"period": 14}
- ROC:         {"period": 10}
- PRICE:       {}
- VOLUME:      {}

Operators: "<", ">", "<=", ">=", "crosses_above", "crosses_below"

Common patterns:
- "RSI below 30" → RSI < 30 (value)
- "price above 50-day SMA" → PRICE > SMA(50) (right_indicator)
- "MACD crosses above signal" → MACD_LINE crosses_above MACD_SIGNAL (right_indicator)
- "price below lower Bollinger Band" → PRICE < BB_LOWER (right_indicator)
- "50-day SMA crosses above 200-day SMA" → SMA(50) crosses_above SMA(200) (right_indicator)
- "MACD histogram positive" → MACD_HIST > 0 (value)

Return ONLY valid JSON in this exact format:
{
  "name": "RSI Reversal",
  "ticker": "SPY",
  "buy_conditions": {"logic": "AND", "rules": []},
  "sell_conditions": {"logic": "AND", "rules": []}
}

"name" should be a short 2-4 word strategy name (e.g. "RSI Reversal", "MACD Crossover", "Bollinger Bounce").
If ticker is not mentioned, set "ticker" to null.
If no sell condition is mentioned, leave sell_conditions.rules as an empty array."""


def parse_nl_strategy(text: str) -> dict:
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": text}],
    )
    raw = message.content[0].text.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())
