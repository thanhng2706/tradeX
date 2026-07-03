import api from './client'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StrategyReadyData {
  name: string
  ticker: string
  description: string
  position_size_pct: number
  buy_conditions: { logic: string; rules: any[] }
  sell_conditions: { logic: string; rules: any[] }
}

export interface BacktestResultData {
  ticker: string
  start_date: string
  end_date: string
  starting_balance: number
  total_return_pct: number
  annualized_return_pct: number
  sharpe_ratio: number
  max_drawdown_pct: number
  win_rate: number
  num_trades: number
  final_value: number
}

export interface ChatAction {
  type: 'strategy_ready' | 'backtest_result'
  data: StrategyReadyData | BacktestResultData
}

export interface ChatResponse {
  message: string
  actions: ChatAction[]
}

export const chatApi = {
  send: (messages: ChatMessage[]): Promise<ChatResponse> =>
    api.post('/chat', { messages }).then((r) => r.data),
}
