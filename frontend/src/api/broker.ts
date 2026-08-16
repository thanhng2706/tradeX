import api from './client'

export interface BrokerStatus {
  connected: boolean
  broker: string | null
  is_paper: boolean | null
  alpaca_account_number: string | null
  buying_power: number | null
  cash: number | null
  connected_at: string | null
  credentials_valid: boolean
  kill_switch_active: boolean
  kill_switch_activated_at: string | null
  total_exposure_usd: number | null
  total_exposure_pct: number | null
  max_total_exposure_pct: number | null
}

export interface ClosedPosition {
  symbol: string
  qty: number
  order_id: string | null
  status: string | null
}

export interface ClosePositionError {
  symbol: string
  error: string
}

export interface BrokerClosePositionsResponse {
  closed: ClosedPosition[]
  errors: ClosePositionError[]
}

export interface BrokerDeploymentSummary {
  id: number
  strategy_id: number
  strategy_name: string
  ticker: string
  portfolio_id: number
  status: 'active' | 'stopped' | 'error'
  started_at: string
  last_tick_at: string | null
  last_error: string | null
  consecutive_failures: number
}

export interface BrokerOrderSummary {
  id: number
  deployment_id: number
  strategy_name: string
  ticker: string
  side: 'BUY' | 'SELL'
  qty: number
  order_type: string
  status: string | null
  filled_qty: number | null
  filled_avg_price: number | null
  trade_date: string
  created_at: string
}

export interface BrokerOverview {
  deployments: BrokerDeploymentSummary[]
  orders: BrokerOrderSummary[]
}

export const brokerApi = {
  status: () => api.get<BrokerStatus>('/broker/status').then((r) => r.data),

  connect: (apiKey: string, apiSecret: string, isPaper: boolean) =>
    api.post<BrokerStatus>('/broker/connect', {
      api_key: apiKey,
      api_secret: apiSecret,
      is_paper: isPaper,
    }).then((r) => r.data),

  disconnect: () => api.delete('/broker/disconnect').then((r) => r.data),

  overview: () => api.get<BrokerOverview>('/broker/overview').then((r) => r.data),

  activateKillSwitch: () => api.post<BrokerStatus>('/broker/kill-switch').then((r) => r.data),

  deactivateKillSwitch: () => api.delete<BrokerStatus>('/broker/kill-switch').then((r) => r.data),

  closeAllPositions: () =>
    api.post<BrokerClosePositionsResponse>('/broker/close-all-positions').then((r) => r.data),
}
