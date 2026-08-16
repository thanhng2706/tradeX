import api from './client'

export interface EquityPoint {
  date: string
  value: number
}

export interface StrategyPerformance {
  strategy_id: number
  strategy_name: string
  ticker: string
  portfolio_id: number
  portfolio_name: string
  asset_type: string
  source: 'live' | 'backtest' | 'none'
  total_pnl_usd: number | null
  total_return_pct: number | null
  num_trades: number
  win_rate: number | null
  live_fill_count: number
  equity_curve: EquityPoint[]
}

export interface PerformanceSummary {
  strategies: StrategyPerformance[]
  live_pnl_usd: number
  live_strategy_count: number
  backtest_pnl_pct_avg: number | null
  backtest_strategy_count: number
}

export const performanceApi = {
  summary: () => api.get<PerformanceSummary>('/performance/summary').then((r) => r.data),
}
