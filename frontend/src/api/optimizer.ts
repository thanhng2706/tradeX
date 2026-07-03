import api from './client'

export interface OptimizedResult {
  rank: number
  buy_conditions: Record<string, any>
  sell_conditions: Record<string, any>
  position_size_pct: number
  total_return_pct: number
  annualized_return_pct: number
  sharpe_ratio: number
  max_drawdown_pct: number
  win_rate: number
  num_trades: number
  final_balance: number
}

export interface OptimizeResponse {
  strategy_id: number
  ticker: string
  starting_balance: number
  results: OptimizedResult[]
}

export const optimizerApi = {
  run: (strategyId: number, startDate: string, endDate: string) =>
    api.post<OptimizeResponse>(`/strategies/${strategyId}/optimize`, {
      start_date: startDate,
      end_date: endDate,
    }).then((r) => r.data),

  apply: (strategyId: number, result: Pick<OptimizedResult, 'buy_conditions' | 'sell_conditions' | 'position_size_pct'>) =>
    api.post(`/strategies/${strategyId}/optimize/apply`, {
      buy_conditions: result.buy_conditions,
      sell_conditions: result.sell_conditions,
      position_size_pct: result.position_size_pct,
    }).then((r) => r.data),
}
