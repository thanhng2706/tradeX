import api from './client'

export interface BrokerOrder {
  id: number
  side: 'BUY' | 'SELL'
  qty: number
  order_type: string
  status: string | null
  filled_qty: number | null
  filled_avg_price: number | null
  trade_date: string
  created_at: string
  contract_symbol?: string | null
  strike?: number | null
  expiration?: string | null
  option_type?: 'call' | 'put' | null
}

export interface BrokerDeployEvent {
  id: number
  date: string
  type: 'BUY_SIGNAL' | 'SELL_SIGNAL' | 'SIGNAL_SUPPRESSED' | 'ORDER_SUBMITTED' | 'ORDER_FILLED' | 'ORDER_REJECTED' | 'DEPLOYMENT_PAUSED'
  message: string
  created_at: string
}

export interface BrokerDeployment {
  id: number
  strategy_id: number
  status: 'active' | 'stopped' | 'error'
  started_at: string
  last_tick_at: string | null
  last_error: string | null
  consecutive_failures: number
  created_at: string
  orders: BrokerOrder[]
  events: BrokerDeployEvent[]
}

export const brokerDeployApi = {
  deploy: (strategyId: number) =>
    api.post<BrokerDeployment>(`/strategies/${strategyId}/broker-deploy`).then((r) => r.data),

  undeploy: (strategyId: number) =>
    api.delete<BrokerDeployment>(`/strategies/${strategyId}/broker-deploy`).then((r) => r.data),

  status: (strategyId: number) =>
    api.get<BrokerDeployment>(`/strategies/${strategyId}/broker-deploy`).then((r) => r.data),

  runNow: (strategyId: number) =>
    api.post<BrokerDeployment>(`/strategies/${strategyId}/broker-deploy/run-now`).then((r) => r.data),
}
