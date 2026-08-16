from anthropic import Anthropic
from app.config import settings

_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


def generate_verdicts(results: list[dict], strategy_name: str) -> list[str | None]:
    """One Claude call covering every result, so a 5-result optimization run only pays
    for a single extra request instead of one per card. Returns a list the same length
    as `results`; falls back to all-None (card just shows no verdict) if the model's
    reply doesn't come back as exactly one line per result — this is a nice-to-have,
    not something that should ever fail the optimization run itself."""
    if not results:
        return []

    lines = []
    for i, r in enumerate(results, start=1):
        lines.append(
            f"Result {i}: TRAINING return={r['total_return_pct']:.2f}% sharpe={r['sharpe_ratio']:.3f} "
            f"trades={r['num_trades']} win_rate={r['win_rate']:.1f}% | "
            f"VALIDATION return={r.get('validation_total_return_pct')}% sharpe={r.get('validation_sharpe_ratio')} "
            f"trades={r.get('validation_num_trades')} win_rate={r.get('validation_win_rate')}%"
        )

    prompt = f"""You are reviewing genetic-algorithm optimization results for a trading strategy called "{strategy_name}".
Each result was tuned on a TRAINING date range, then separately re-tested on a held-out
VALIDATION range it was never tuned against.

{chr(10).join(lines)}

For each result, write exactly ONE short sentence (under 20 words) judging whether the
validation performance confirms the training performance is real, or whether it looks
overfit to the training window. Be direct and specific to that result's numbers.

Reply with EXACTLY {len(results)} lines, one sentence per line, in the same order as
above, and nothing else — no numbering, no headers, no blank lines."""

    msg = _get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    text = msg.content[0].text.strip()
    verdict_lines = [line.strip() for line in text.split("\n") if line.strip()]

    if len(verdict_lines) != len(results):
        return [None] * len(results)
    return verdict_lines
