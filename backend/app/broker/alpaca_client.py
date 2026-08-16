import requests

PAPER_BASE_URL = "https://paper-api.alpaca.markets/v2"
LIVE_BASE_URL = "https://api.alpaca.markets/v2"
DATA_BASE_URL = "https://data.alpaca.markets/v1beta1"


class AlpacaAuthError(Exception):
    pass


def _base_url(is_paper: bool) -> str:
    return PAPER_BASE_URL if is_paper else LIVE_BASE_URL


def _headers(api_key: str, api_secret: str) -> dict:
    return {"APCA-API-KEY-ID": api_key, "APCA-API-SECRET-KEY": api_secret}


def get_account(api_key: str, api_secret: str, is_paper: bool) -> dict:
    resp = requests.get(
        f"{_base_url(is_paper)}/account",
        headers=_headers(api_key, api_secret),
        timeout=10,
    )
    if resp.status_code == 401 or resp.status_code == 403:
        raise AlpacaAuthError("Alpaca rejected these API credentials")
    resp.raise_for_status()
    return resp.json()


def get_position(api_key: str, api_secret: str, is_paper: bool, symbol: str) -> dict | None:
    resp = requests.get(
        f"{_base_url(is_paper)}/positions/{symbol}",
        headers=_headers(api_key, api_secret),
        timeout=10,
    )
    if resp.status_code == 404:
        return None
    if resp.status_code in (401, 403):
        raise AlpacaAuthError("Alpaca rejected these API credentials")
    resp.raise_for_status()
    return resp.json()


def list_positions(api_key: str, api_secret: str, is_paper: bool) -> list[dict]:
    resp = requests.get(
        f"{_base_url(is_paper)}/positions",
        headers=_headers(api_key, api_secret),
        timeout=10,
    )
    if resp.status_code in (401, 403):
        raise AlpacaAuthError("Alpaca rejected these API credentials")
    resp.raise_for_status()
    return resp.json()


def get_order(api_key: str, api_secret: str, is_paper: bool, order_id: str) -> dict:
    resp = requests.get(
        f"{_base_url(is_paper)}/orders/{order_id}",
        headers=_headers(api_key, api_secret),
        timeout=10,
    )
    if resp.status_code in (401, 403):
        raise AlpacaAuthError("Alpaca rejected these API credentials")
    resp.raise_for_status()
    return resp.json()


def submit_order(api_key: str, api_secret: str, is_paper: bool, symbol: str, qty: float, side: str) -> dict:
    # Alpaca requires whole-number qty strings for options ("3", not "3.0") — equities keep fractional precision.
    qty_str = str(int(qty)) if float(qty).is_integer() else str(round(qty, 4))
    resp = requests.post(
        f"{_base_url(is_paper)}/orders",
        headers=_headers(api_key, api_secret),
        json={
            "symbol": symbol,
            "qty": qty_str,
            "side": side.lower(),
            "type": "market",
            "time_in_force": "day",
        },
        timeout=10,
    )
    if resp.status_code in (401, 403):
        raise AlpacaAuthError("Alpaca rejected these API credentials")
    if resp.status_code >= 400:
        detail = resp.json().get("message", resp.text) if resp.content else resp.text
        raise RuntimeError(f"Alpaca order rejected: {detail}")
    return resp.json()


def get_option_contracts(
    api_key: str, api_secret: str, is_paper: bool,
    underlying_symbol: str, option_type: str,
    expiration_date_gte: str, expiration_date_lte: str,
) -> list[dict]:
    resp = requests.get(
        f"{_base_url(is_paper)}/options/contracts",
        headers=_headers(api_key, api_secret),
        params={
            "underlying_symbols": underlying_symbol,
            "type": option_type,
            "expiration_date_gte": expiration_date_gte,
            "expiration_date_lte": expiration_date_lte,
            "status": "active",
            "limit": 100,
        },
        timeout=10,
    )
    if resp.status_code in (401, 403):
        raise AlpacaAuthError("Alpaca rejected these API credentials")
    resp.raise_for_status()
    return resp.json().get("option_contracts", [])


def get_option_snapshot(
    api_key: str, api_secret: str, underlying_symbol: str,
    option_type: str, strike_price: float, expiration_date: str,
) -> dict:
    """Latest quote/greeks for option contracts matching type+strike+expiration. The
    snapshots endpoint filters by these fields (not by a symbols list — confirmed against
    the real API, which 400s on an unexpected `symbols` param). Uses the market-data API
    (separate base URL/host from the trading API), so it never hits the paper/live trading
    endpoint even for paper accounts. Returns the snapshots dict keyed by contract symbol."""
    resp = requests.get(
        f"{DATA_BASE_URL}/options/snapshots/{underlying_symbol}",
        headers=_headers(api_key, api_secret),
        params={
            "type": option_type,
            "strike_price_gte": strike_price - 0.01,
            "strike_price_lte": strike_price + 0.01,
            "expiration_date": expiration_date,
            "feed": "indicative",
        },
        timeout=10,
    )
    if resp.status_code in (401, 403):
        raise AlpacaAuthError("Alpaca rejected these API credentials")
    resp.raise_for_status()
    return resp.json().get("snapshots", {})
