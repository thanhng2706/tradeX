import api from './client'

export interface PaperTradeRecord {
  id: number
  strategy_id: number
  started_at: string
  status: string
  health_score: number | null
  health_report: string | null
  health_checked_at: string | null
  created_at: string
}

export interface PaperEvent {
  date: string
  type: 'BUY_SIGNAL' | 'SELL_SIGNAL' | 'SIGNAL_SUPPRESSED' | 'ORDER_FILLED' | 'BACKTEST_COMPLETE'
  message: string
}

export interface PaperStatus {
  paper_trade: PaperTradeRecord
  total_return_pct: number
  final_balance: number
  starting_balance: number
  num_trades: number
  win_rate: number
  sharpe_ratio: number
  max_drawdown_pct: number
  current_position: 'IN' | 'OUT'
  last_buy_price: number
  current_price: number
  unrealized_pct: number
  recent_trades: any[]
  equity_curve: { date: string; value: number }[]
  events: PaperEvent[]
  days_active: number
  error: string | null
}

export const paperTradingApi = {
  activate: (strategyId: number) =>
    api.post<PaperTradeRecord>(`/strategies/${strategyId}/paper-trade`).then((r) => r.data),

  deactivate: (strategyId: number) =>
    api.delete<PaperTradeRecord>(`/strategies/${strategyId}/paper-trade`).then((r) => r.data),

  getStatus: (strategyId: number) =>
    api.get<PaperStatus>(`/strategies/${strategyId}/paper-trade`).then((r) => r.data),

  runHealthCheck: (strategyId: number) =>
    api.post<PaperTradeRecord>(`/strategies/${strategyId}/paper-trade/health-check`).then((r) => r.data),
}
