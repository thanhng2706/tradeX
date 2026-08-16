import copy
import random
import pandas as pd
from app.backtesting.engine import run_backtest

POPULATION = 20
GENERATIONS = 15
TOURNAMENT_K = 3
MUTATION_RATE = 0.25
MIN_TRADES = 3


def _get_specs(buy_conditions: dict, sell_conditions: dict, position_size_pct: float) -> list:
    """Build ordered list of (path, current_value, lo, hi, dtype) for every evolvable param."""
    specs = []
    for side, conds in [("buy", buy_conditions), ("sell", sell_conditions)]:
        for i, rule in enumerate(conds.get("rules", [])):
            ind = rule["indicator"]
            period = rule.get("params", {}).get("period")
            value = rule.get("value")

            if period is not None:
                lo, hi = (5, 50) if ind == "RSI" else (5, 200)
                specs.append((f"{side}.{i}.period", float(period), float(lo), float(hi), int))

            if value is not None and isinstance(value, (int, float)) and ind == "RSI":
                lo, hi = (10.0, 49.0) if side == "buy" else (51.0, 90.0)
                specs.append((f"{side}.{i}.value", float(value), lo, hi, float))

            if value is not None and isinstance(value, (int, float)) and ind == "ML_SIGNAL":
                lo, hi = (0.5, 0.95) if side == "buy" else (0.05, 0.5)
                specs.append((f"{side}.{i}.value", float(value), lo, hi, float))

    specs.append(("pos", float(position_size_pct), 2.0, 50.0, float))
    return specs


def _decode(individual: list, specs: list, buy_conditions: dict, sell_conditions: dict):
    buy = copy.deepcopy(buy_conditions)
    sell = copy.deepcopy(sell_conditions)
    pos_size = 10.0

    for (path, _, lo, hi, dtype), raw in zip(specs, individual):
        val = max(lo, min(hi, raw))
        val = int(round(val)) if dtype == int else float(val)

        if path == "pos":
            pos_size = val
            continue

        parts = path.split(".")
        side, idx, attr = parts[0], int(parts[1]), parts[2]
        conds = buy if side == "buy" else sell
        if attr == "period":
            conds["rules"][idx].setdefault("params", {})["period"] = val
        elif attr == "value":
            conds["rules"][idx]["value"] = round(val, 2)

    return buy, sell, pos_size


def _fitness(individual, specs, buy_conditions, sell_conditions, df, starting_balance) -> float:
    try:
        buy, sell, pos_size = _decode(individual, specs, buy_conditions, sell_conditions)
        result = run_backtest(buy, sell, df, starting_balance, pos_size)
    except Exception:
        return -999.0
    if result["num_trades"] < MIN_TRADES:
        return -1.0
    sharpe = result["sharpe_ratio"]
    return sharpe if sharpe > -100 else -1.0


def _tournament(pop: list, fitnesses: list) -> list:
    candidates = random.sample(range(len(pop)), TOURNAMENT_K)
    best_idx = max(candidates, key=lambda i: fitnesses[i])
    return list(pop[best_idx])


def _crossover(p1: list, p2: list) -> list:
    return [p1[i] if random.random() < 0.5 else p2[i] for i in range(len(p1))]


def _mutate(individual: list, specs: list) -> list:
    result = list(individual)
    for i, (_, _, lo, hi, _) in enumerate(specs):
        if random.random() < MUTATION_RATE:
            result[i] += random.gauss(0, (hi - lo) * 0.15)
    return result


def run_optimizer(
    buy_conditions: dict,
    sell_conditions: dict,
    position_size_pct: float,
    df: pd.DataFrame,
    starting_balance: float,
    validation_df: pd.DataFrame | None = None,
) -> list[dict]:
    """`df` is the training window — the genetic search evolves and scores every
    candidate against this data ONLY. `validation_df`, if given, is a separate,
    held-out date range the search never sees; the final top candidates each get
    one extra backtest against it purely for reporting, so a result that overfit
    to `df`'s coincidences is visible (great training numbers, poor validation ones)
    instead of looking uniformly convincing."""
    specs = _get_specs(buy_conditions, sell_conditions, position_size_pct)
    if not specs:
        return []

    seed = [v for (_, v, _, _, _) in specs]

    pop = [seed]
    while len(pop) < POPULATION:
        pop.append([lo + random.random() * (hi - lo) for (_, _, lo, hi, _) in specs])

    for _ in range(GENERATIONS):
        fitnesses = [_fitness(ind, specs, buy_conditions, sell_conditions, df, starting_balance) for ind in pop]
        sorted_idx = sorted(range(len(pop)), key=lambda i: fitnesses[i], reverse=True)

        new_pop = [list(pop[sorted_idx[0]]), list(pop[sorted_idx[1]])]
        while len(new_pop) < POPULATION:
            child = _crossover(_tournament(pop, fitnesses), _tournament(pop, fitnesses))
            new_pop.append(_mutate(child, specs))
        pop = new_pop

    # Evaluate final population and collect top 5 unique results
    final_fitnesses = [_fitness(ind, specs, buy_conditions, sell_conditions, df, starting_balance) for ind in pop]
    sorted_pop = sorted(zip(final_fitnesses, pop), key=lambda x: x[0], reverse=True)

    seen: set[str] = set()
    top_results = []

    for fitness, ind in sorted_pop:
        if fitness <= -1.0:
            continue
        buy, sell, pos_size = _decode(ind, specs, buy_conditions, sell_conditions)
        key = f"{buy}|{sell}|{round(pos_size, 1)}"
        if key in seen:
            continue
        seen.add(key)

        try:
            metrics = run_backtest(buy, sell, df, starting_balance, pos_size)
        except Exception:
            continue

        result = {
            "buy_conditions": buy,
            "sell_conditions": sell,
            "position_size_pct": round(pos_size, 1),
            "total_return_pct": metrics["total_return_pct"],
            "annualized_return_pct": metrics["annualized_return_pct"],
            "sharpe_ratio": metrics["sharpe_ratio"],
            "max_drawdown_pct": metrics["max_drawdown_pct"],
            "win_rate": metrics["win_rate"],
            "num_trades": metrics["num_trades"],
            "final_balance": metrics["final_balance"],
        }

        if validation_df is not None:
            try:
                val_metrics = run_backtest(buy, sell, validation_df, starting_balance, pos_size)
                result["validation_total_return_pct"] = val_metrics["total_return_pct"]
                result["validation_annualized_return_pct"] = val_metrics["annualized_return_pct"]
                result["validation_sharpe_ratio"] = val_metrics["sharpe_ratio"]
                result["validation_max_drawdown_pct"] = val_metrics["max_drawdown_pct"]
                result["validation_win_rate"] = val_metrics["win_rate"]
                result["validation_num_trades"] = val_metrics["num_trades"]
            except Exception:
                pass

        top_results.append(result)
        if len(top_results) >= 5:
            break

    return top_results
