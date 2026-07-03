from anthropic import Anthropic
from app.config import settings

_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


def explain_backtest(metrics: dict, strategy_name: str) -> str:
    prompt = f"""You are analyzing the backtest results for a trading strategy called "{strategy_name}".

Results:
- Total Return: {metrics['total_return_pct']:.2f}%
- Annualized Return: {metrics['annualized_return_pct']:.2f}%
- Sharpe Ratio: {metrics['sharpe_ratio']:.3f}
- Max Drawdown: {metrics['max_drawdown_pct']:.2f}%
- Win Rate: {metrics['win_rate']:.2f}%
- Number of Trades: {metrics['num_trades']}
- Final Balance: ${metrics['final_balance']:,.2f}

Write 3 short paragraphs:
1. Overall verdict — is this a good strategy? Why?
2. What it did well and what went wrong.
3. One or two specific, actionable suggestions to improve it.

Be direct and plain. No bullet points. No headers."""

    msg = _get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text
