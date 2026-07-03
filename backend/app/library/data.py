LIBRARY_STRATEGIES = [
    # ── Long Term ────────────────────────────────────────────────────────────
    {
        "id": "spy-golden-cross",
        "name": "SPY Golden Cross",
        "ticker": "SPY",
        "category": "Long Term",
        "description": "Buy when the 50-day SMA crosses above the 200-day SMA. Classic long-term trend-following signal used by institutional investors.",
        "position_size_pct": 95.0,
        "buy_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "SMA", "params": {"period": 50}, "operator": "crosses_above", "value": None, "right_indicator": "SMA", "right_params": {"period": 200}}],
        },
        "sell_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "SMA", "params": {"period": 50}, "operator": "crosses_below", "value": None, "right_indicator": "SMA", "right_params": {"period": 200}}],
        },
    },
    {
        "id": "qqq-rsi-accumulation",
        "name": "QQQ RSI Accumulation",
        "ticker": "QQQ",
        "category": "Long Term",
        "description": "Accumulate QQQ during oversold dips. Buys tech exposure when fear drives RSI low, holds until momentum returns.",
        "position_size_pct": 20.0,
        "buy_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "RSI", "params": {"period": 14}, "operator": "<", "value": 35}],
        },
        "sell_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "RSI", "params": {"period": 14}, "operator": ">", "value": 65}],
        },
    },

    # ── ETFs ─────────────────────────────────────────────────────────────────
    {
        "id": "spy-rsi-reversal",
        "name": "SPY RSI Reversal",
        "ticker": "SPY",
        "category": "ETFs",
        "description": "Classic mean-reversion strategy on SPY. Buys extreme oversold conditions, exits at overbought. Works best in range-bound markets.",
        "position_size_pct": 10.0,
        "buy_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "RSI", "params": {"period": 14}, "operator": "<", "value": 30}],
        },
        "sell_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "RSI", "params": {"period": 14}, "operator": ">", "value": 70}],
        },
    },
    {
        "id": "spy-bollinger-bounce",
        "name": "SPY Bollinger Bounce",
        "ticker": "SPY",
        "category": "ETFs",
        "description": "Buys when SPY price falls below the lower Bollinger Band (statistical oversold) and sells when it reaches the upper band.",
        "position_size_pct": 50.0,
        "buy_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "PRICE", "params": {}, "operator": "<", "value": None, "right_indicator": "BB_LOWER", "right_params": {"period": 20, "std_dev": 2.0}}],
        },
        "sell_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "PRICE", "params": {}, "operator": ">", "value": None, "right_indicator": "BB_UPPER", "right_params": {"period": 20, "std_dev": 2.0}}],
        },
    },
    {
        "id": "spy-sma-trend",
        "name": "SPY SMA Trend Filter",
        "ticker": "SPY",
        "category": "ETFs",
        "description": "Hold SPY only when it is above the 200-day SMA (bull market). Exit when price drops below — a simple but effective bear market filter.",
        "position_size_pct": 95.0,
        "buy_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "PRICE", "params": {}, "operator": ">", "value": None, "right_indicator": "SMA", "right_params": {"period": 200}}],
        },
        "sell_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "PRICE", "params": {}, "operator": "<", "value": None, "right_indicator": "SMA", "right_params": {"period": 200}}],
        },
    },

    # ── Active Trading ────────────────────────────────────────────────────────
    {
        "id": "spy-macd-momentum",
        "name": "MACD Momentum",
        "ticker": "SPY",
        "category": "Active Trading",
        "description": "Rides MACD momentum on SPY. Enters when the histogram turns positive (bullish), exits when it turns negative. High trade frequency.",
        "position_size_pct": 10.0,
        "buy_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "MACD_HIST", "params": {"fast": 12, "slow": 26, "signal": 9}, "operator": ">", "value": 0}],
        },
        "sell_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "MACD_HIST", "params": {"fast": 12, "slow": 26, "signal": 9}, "operator": "<", "value": 0}],
        },
    },
    {
        "id": "spy-macd-crossover",
        "name": "MACD Line Crossover",
        "ticker": "SPY",
        "category": "Active Trading",
        "description": "Enters only at the exact moment the MACD line crosses above the signal line. More precise than histogram momentum — fewer false entries.",
        "position_size_pct": 10.0,
        "buy_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "MACD_LINE", "params": {"fast": 12, "slow": 26, "signal": 9}, "operator": "crosses_above", "value": None, "right_indicator": "MACD_SIGNAL", "right_params": {"fast": 12, "slow": 26, "signal": 9}}],
        },
        "sell_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "MACD_LINE", "params": {"fast": 12, "slow": 26, "signal": 9}, "operator": "crosses_below", "value": None, "right_indicator": "MACD_SIGNAL", "right_params": {"fast": 12, "slow": 26, "signal": 9}}],
        },
    },
    {
        "id": "spy-rsi-atr-filter",
        "name": "RSI + ATR Volatility Filter",
        "ticker": "SPY",
        "category": "Active Trading",
        "description": "RSI oversold strategy with an ATR filter — only buys during high-volatility environments where mean reversion opportunities are larger.",
        "position_size_pct": 10.0,
        "buy_conditions": {
            "logic": "AND",
            "rules": [
                {"indicator": "RSI", "params": {"period": 14}, "operator": "<", "value": 30},
                {"indicator": "ATR", "params": {"period": 14}, "operator": ">", "value": 5},
            ],
        },
        "sell_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "RSI", "params": {"period": 14}, "operator": ">", "value": 70}],
        },
    },
    {
        "id": "spy-roc-momentum",
        "name": "ROC Momentum",
        "ticker": "SPY",
        "category": "Active Trading",
        "description": "Buys SPY when 10-day rate of change shows strong upward momentum, sells on downward momentum. Pure price momentum approach.",
        "position_size_pct": 10.0,
        "buy_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "ROC", "params": {"period": 10}, "operator": ">", "value": 3}],
        },
        "sell_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "ROC", "params": {"period": 10}, "operator": "<", "value": -3}],
        },
    },

    # ── Leveraged ─────────────────────────────────────────────────────────────
    {
        "id": "tqqq-rsi-swing",
        "name": "TQQQ RSI Swing",
        "ticker": "TQQQ",
        "category": "Leveraged",
        "description": "Swing trades 3x leveraged QQQ using tight RSI thresholds. Higher reward but significant risk — only for experienced traders.",
        "position_size_pct": 10.0,
        "buy_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "RSI", "params": {"period": 10}, "operator": "<", "value": 25}],
        },
        "sell_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "RSI", "params": {"period": 10}, "operator": ">", "value": 75}],
        },
    },
    {
        "id": "soxl-macd-momentum",
        "name": "SOXL MACD Momentum",
        "ticker": "SOXL",
        "category": "Leveraged",
        "description": "Rides semiconductor sector momentum with 3x leverage using MACD histogram. High volatility — position sizing is critical.",
        "position_size_pct": 5.0,
        "buy_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "MACD_HIST", "params": {"fast": 12, "slow": 26, "signal": 9}, "operator": ">", "value": 0}],
        },
        "sell_conditions": {
            "logic": "AND",
            "rules": [{"indicator": "MACD_HIST", "params": {"fast": 12, "slow": 26, "signal": 9}, "operator": "<", "value": 0}],
        },
    },
]

LIBRARY_MAP = {s["id"]: s for s in LIBRARY_STRATEGIES}
