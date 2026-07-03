import api from './client'

export interface StockInfo {
  symbol: string
  name: string
  sector: string | null
  industry: string | null
  description: string | null
  exchange: string | null
  currency: string | null

  price: number | null
  previous_close: number | null
  change_pct: number | null
  day_high: number | null
  day_low: number | null
  fifty_two_week_high: number | null
  fifty_two_week_low: number | null

  market_cap: number | null
  pe_ratio: number | null
  forward_pe: number | null
  ps_ratio: number | null
  price_to_book: number | null
  dividend_yield: number | null
  eps: number | null
  forward_eps: number | null
  revenue: number | null
  gross_profit: number | null
  ebitda: number | null
  free_cash_flow: number | null
  total_debt: number | null
  total_cash: number | null
  enterprise_value: number | null
  beta: number | null
  avg_volume: number | null
  shares_outstanding: number | null
}

export interface ChartPoint {
  date: string
  close: number
}

export interface ScreenerResult {
  symbol: string
  name: string
  sector: string | null
  industry: string | null
  price: number | null
  currency: string | null
  market_cap: number | null
  pe_ratio: number | null
  revenue: number | null
  free_cash_flow: number | null
}

export interface ScreenerFilters {
  category: string | null
  min_market_cap: number | null
  max_market_cap: number | null
  min_pe: number | null
  max_pe: number | null
  min_revenue: number | null
  min_fcf: number | null
}

export interface FinancialsRow {
  period: string
  revenue: number | null
  gross_profit: number | null
  operating_income: number | null
  net_income: number | null
  ebitda: number | null
  total_assets: number | null
  total_liabilities: number | null
  free_cash_flow: number | null
}

export interface Quote {
  symbol: string
  price: number | null
  change_pct: number | null
  currency: string | null
}

export const researchApi = {
  getQuotes: (symbols: string[]) =>
    api.get<Quote[]>('/research/quotes', { params: { symbols: symbols.join(',') } }).then((r) => r.data),

  getStock: (symbol: string) =>
    api.get<StockInfo>(`/research/stock/${symbol}`).then((r) => r.data),

  getHistory: (symbol: string, period: string = '3mo') =>
    api.get<ChartPoint[]>(`/research/stock/${symbol}/history`, { params: { period } }).then((r) => r.data),

  getFinancials: (symbol: string) =>
    api.get<FinancialsRow[]>(`/research/stock/${symbol}/financials`).then((r) => r.data),

  generateReport: (symbol: string) =>
    api.post<{ report: string }>(`/research/stock/${symbol}/report`).then((r) => r.data.report),

  getCategories: () =>
    api.get<string[]>('/research/screener/categories').then((r) => r.data),

  runScreener: (filters: Partial<ScreenerFilters>) =>
    api.get<ScreenerResult[]>('/research/screener', { params: filters }).then((r) => r.data),

  runAiScreener: (query: string) =>
    api.post<{ filters: ScreenerFilters; results: ScreenerResult[] }>('/research/screener/ai', { query }).then((r) => r.data),

  runDeepDive: (topic: string, symbol?: string) =>
    api.post<{ report: string }>('/research/deep-dive', { topic, symbol }).then((r) => r.data.report),
}
