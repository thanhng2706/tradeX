import api from './client'

export interface Rule {
  indicator: string
  params: Record<string, number>
  operator: string
  value: number | null
  right_indicator?: string | null
  right_params?: Record<string, number> | null
}

export interface ConditionSet {
  logic: 'AND' | 'OR'
  rules: Rule[]
}

export type AssetType = 'equity' | 'option'
export type OptionType = 'call' | 'put'

export interface Strategy {
  id: number
  name: string
  description: string
  ticker: string
  buy_conditions: ConditionSet
  sell_conditions: ConditionSet
  position_size_pct: number
  asset_type: AssetType
  option_type: OptionType | null
  strike_distance_pct: number | null
  dte_min: number | null
  dte_max: number | null
  take_profit_pct: number | null
  stop_loss_pct: number | null
  max_days_held: number | null
  created_at: string
  portfolio_id: number
}

export interface StrategyPayload {
  name: string
  description: string
  ticker: string
  buy_conditions: ConditionSet
  sell_conditions: ConditionSet
  position_size_pct: number
  asset_type?: AssetType
  option_type?: OptionType | null
  strike_distance_pct?: number | null
  dte_min?: number | null
  dte_max?: number | null
  take_profit_pct?: number | null
  stop_loss_pct?: number | null
  max_days_held?: number | null
}

export const strategiesApi = {
  list: (portfolioId: number) =>
    api.get<Strategy[]>(`/portfolios/${portfolioId}/strategies`).then((r) => r.data),

  create: (portfolioId: number, payload: StrategyPayload) =>
    api.post<Strategy>(`/portfolios/${portfolioId}/strategies`, payload).then((r) => r.data),

  update: (strategyId: number, payload: Partial<StrategyPayload>) =>
    api.put<Strategy>(`/strategies/${strategyId}`, payload).then((r) => r.data),

  delete: (strategyId: number) =>
    api.delete(`/strategies/${strategyId}`),

  parseNL: (text: string) =>
    api.post<{ name: string | null; ticker: string | null; buy_conditions: ConditionSet; sell_conditions: ConditionSet }>(
      '/strategies/parse-nl',
      { text },
    ).then((r) => r.data),
}
