import api from './client'

export interface WatchlistAsset {
  id: number
  symbol: string
  added_at: string
}

export interface Watchlist {
  id: number
  name: string
  created_at: string
  assets: WatchlistAsset[]
}

export interface AssetPrice {
  symbol: string
  price: number | null
  change_pct: number | null
  day_high: number | null
  day_low: number | null
}

export interface ChartPoint {
  date: string
  close: number
}

export const watchlistsApi = {
  list: () =>
    api.get<Watchlist[]>('/watchlists').then((r) => r.data),

  create: (name: string) =>
    api.post<Watchlist>('/watchlists', { name }).then((r) => r.data),

  remove: (id: number) =>
    api.delete(`/watchlists/${id}`),

  addAsset: (id: number, symbol: string) =>
    api.post<Watchlist>(`/watchlists/${id}/assets`, { symbol }).then((r) => r.data),

  removeAsset: (id: number, symbol: string) =>
    api.delete<Watchlist>(`/watchlists/${id}/assets/${symbol}`).then((r) => r.data),

  getPrices: (id: number) =>
    api.get<AssetPrice[]>(`/watchlists/${id}/prices`).then((r) => r.data),

  getChart: (symbol: string) =>
    api.get<ChartPoint[]>(`/watchlists/chart/${symbol}`).then((r) => r.data),

  getAllCharts: (id: number) =>
    api.get<Record<string, ChartPoint[]>>(`/watchlists/${id}/charts`).then((r) => r.data),
}
