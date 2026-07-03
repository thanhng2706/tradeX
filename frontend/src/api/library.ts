import api from './client'
import { ConditionSet } from './strategies'

export interface LibraryStrategy {
  id: string
  name: string
  ticker: string
  category: string
  description: string
  position_size_pct: number
  buy_conditions: ConditionSet
  sell_conditions: ConditionSet
}

export const libraryApi = {
  list: () =>
    api.get<LibraryStrategy[]>('/library').then((r) => r.data),

  copyToPortfolio: (strategyId: string, portfolioId: number) =>
    api.post(`/library/${strategyId}/copy`, { portfolio_id: portfolioId }).then((r) => r.data),
}
