from anthropic import Anthropic
from app.config import settings
from app.models import Strategy

_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


def _fmt_indicator(ind: str, params: dict) -> str:
    if not params:
        return ind
    vals = list(params.values())
    return f"{ind}({','.join(str(v) for v in vals)})"


def _conditions_to_text(conditions: dict) -> str:
    rules = conditions.get("rules", [])
    if not rules:
        return "No conditions defined"
    logic = conditions.get("logic", "AND")
    parts = []
    for rule in rules:
        left = _fmt_indicator(rule["indicator"], rule.get("params", {}))
        op = rule.get("operator", "")
        right_ind = rule.get("right_indicator")
        if right_ind:
            right = _fmt_indicator(right_ind, rule.get("right_params") or {})
        else:
            right = str(rule.get("value", ""))
        parts.append(f"{left} {op} {right}")
    return f" {logic} ".join(parts)


def run_health_check(strategy: Strategy, paper_status: dict) -> tuple[int, str]:
    buy_text = _conditions_to_text(strategy.buy_conditions)
    sell_text = _conditions_to_text(strategy.sell_conditions)

    prompt = f"""You are evaluating the health of a trading strategy called "{strategy.name}" on {strategy.ticker}.

Strategy rules:
- BUY when: {buy_text}
- SELL when: {sell_text}
- Position size: {strategy.position_size_pct}% of portfolio per trade

Live performance since activation ({paper_status.get('days_active', 0)} trading days):
- Total Return: {paper_status.get('total_return_pct', 0):.2f}%
- Sharpe Ratio: {paper_status.get('sharpe_ratio', 0):.3f}
- Win Rate: {paper_status.get('win_rate', 0):.1f}%
- Number of Trades: {paper_status.get('num_trades', 0)}
- Max Drawdown: {paper_status.get('max_drawdown_pct', 0):.2f}%
- Current Position: {paper_status.get('current_position', 'OUT')}

Rate the health of this strategy from 1 to 10 and give an honest assessment.

Respond in exactly this format (no extra text):
SCORE: [number 1-10]

VERDICT: [one sentence summary]

STRENGTHS:
- [strength 1]
- [strength 2]

CONCERNS:
- [concern 1]
- [concern 2]

SUGGESTIONS:
- [specific actionable suggestion 1]
- [specific actionable suggestion 2]"""

    msg = _get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    text = msg.content[0].text.strip()

    score = 5
    for line in text.splitlines():
        if line.startswith("SCORE:"):
            try:
                score = int(line.replace("SCORE:", "").strip())
                score = max(1, min(10, score))
            except ValueError:
                pass
            break

    return score, text
