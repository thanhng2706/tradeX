import api from './client'

export interface PricePoint {
  date: string
  close: number
}

export interface RuleDetail {
  indicator: string
  params: Record<string, number>
  operator: string
  right_indicator: string | null
  left_value: number | null
  right_value: number | null
  passed: boolean
}

export interface PositionInfo {
  in_position: boolean
  qty: number | null
  avg_entry_price: number | null
  current_price: number | null
  unrealized_pl: number | null
}

export interface LiveOrder {
  id: number
  side: string
  qty: number
  order_type: string
  status: string | null
  filled_qty: number | null
  filled_avg_price: number | null
  trade_date: string
  created_at: string
}

export interface LiveEvent {
  id: number
  date: string
  type: string
  message: string
  created_at: string
}

export interface LiveStatus {
  strategy_id: number
  strategy_name: string
  ticker: string
  deployment_status: string
  started_at: string
  last_tick_at: string | null
  last_error: string | null
  price_series: PricePoint[]
  orders: LiveOrder[]
  events: LiveEvent[]
  position: PositionInfo
  buy_rules: RuleDetail[]
  sell_rules: RuleDetail[]
  as_of_date: string
}

export interface LiveChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export const liveApi = {
  status: (strategyId: number): Promise<LiveStatus> =>
    api.get(`/strategies/${strategyId}/live-status`).then((r) => r.data),
  chat: (strategyId: number, message: string, history: LiveChatMessage[]): Promise<{ message: string }> =>
    api.post(`/strategies/${strategyId}/live-chat`, { message, history }).then((r) => r.data),
}
