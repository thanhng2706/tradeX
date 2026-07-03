import api from './client'

export interface EquityPoint {
  date: string
  value: number
}

export interface Trade {
  date: string
  action: string
  price: number
  shares: number
  value: number
  pnl?: number
}

export interface BacktestEvent {
  date: string
  type: 'BUY_SIGNAL' | 'SELL_SIGNAL' | 'SIGNAL_SUPPRESSED' | 'ORDER_FILLED' | 'BACKTEST_COMPLETE'
  message: string
}

export interface BacktestResult {
  id: number
  strategy_id: number
  start_date: string
  end_date: string
  starting_balance: number
  final_balance: number
  total_return_pct: number
  annualized_return_pct: number
  sharpe_ratio: number
  max_drawdown_pct: number
  win_rate: number
  num_trades: number
  equity_curve: EquityPoint[]
  trades: Trade[]
  events: BacktestEvent[]
  events_truncated: boolean
  ai_explanation: string | null
  created_at: string
}

export const backtestsApi = {
  run: (strategyId: number, startDate: string, endDate: string) =>
    api.post<BacktestResult>(`/strategies/${strategyId}/backtest`, {
      start_date: startDate,
      end_date: endDate,
    }).then((r) => r.data),

  list: (strategyId: number) =>
    api.get<BacktestResult[]>(`/strategies/${strategyId}/backtests`).then((r) => r.data),

  get: (backtestId: number) =>
    api.get<BacktestResult>(`/backtests/${backtestId}`).then((r) => r.data),
}
