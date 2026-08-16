from datetime import date


def find_contract(contracts: list[dict], target_strike: float, target_expiration: date) -> dict | None:
    """Pick the contract closest to a target strike, among the expiration date closest
    to target_expiration. No fallback-range search (v1 scope: single-leg only)."""
    if not contracts:
        return None

    expirations = sorted({c["expiration_date"] for c in contracts})
    closest_exp = min(expirations, key=lambda e: abs((date.fromisoformat(e) - target_expiration).days))
    candidates = [c for c in contracts if c["expiration_date"] == closest_exp]
    return min(candidates, key=lambda c: abs(float(c["strike_price"]) - target_strike))
