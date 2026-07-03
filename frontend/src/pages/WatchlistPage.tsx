import { useEffect, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { watchlistsApi, Watchlist, AssetPrice, ChartPoint } from '../api/watchlists'

// ── Sparkline (inline mini chart per row) ────────────────────────────────────
function Sparkline({ data, positive }: { data: ChartPoint[]; positive: boolean }) {
  if (!data.length) return <div className="w-24 h-10" />
  const color = positive ? '#10b981' : '#ef4444'
  const min = Math.min(...data.map((d) => d.close))
  const max = Math.max(...data.map((d) => d.close))
  const pad = (max - min) * 0.1 || 0.5
  return (
    <LineChart width={96} height={40} data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
      <YAxis domain={[min - pad, max + pad]} hide />
      <Line type="monotone" dataKey="close" stroke={color} strokeWidth={1.5} dot={false} />
    </LineChart>
  )
}

// ── Stock logo with initial fallback ─────────────────────────────────────────
const LOGO_COLORS: Record<string, string> = {
  A: '#3b82f6', B: '#8b5cf6', C: '#10b981', D: '#f59e0b', E: '#ef4444',
  F: '#06b6d4', G: '#84cc16', H: '#f97316', I: '#6366f1', J: '#ec4899',
  K: '#14b8a6', L: '#a855f7', M: '#22c55e', N: '#eab308', O: '#64748b',
  P: '#0ea5e9', Q: '#d946ef', R: '#f43f5e', S: '#fb923c', T: '#a3e635',
  U: '#38bdf8', V: '#c084fc', W: '#4ade80', X: '#fbbf24', Y: '#818cf8', Z: '#34d399',
}

function StockLogo({ symbol }: { symbol: string }) {
  const [errored, setErrored] = useState(false)
  const initial = symbol[0]?.toUpperCase() ?? '?'
  const bg = LOGO_COLORS[initial] ?? '#6b7280'

  if (!errored) {
    return (
      <img
        src={`https://financialmodelingprep.com/image-stock/${symbol}.png`}
        alt={symbol}
        onError={() => setErrored(true)}
        className="w-8 h-8 rounded-full object-contain bg-gray-800"
      />
    )
  }
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
      style={{ background: bg }}
    >
      {initial}
    </div>
  )
}

// ── Full chart modal ──────────────────────────────────────────────────────────
function ChartModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const [data, setData] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(true)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    watchlistsApi.getChart(symbol).then(setData).finally(() => setLoading(false))
  }, [symbol])

  const minP = data.length ? Math.min(...data.map((d) => d.close)) : 0
  const maxP = data.length ? Math.max(...data.map((d) => d.close)) : 0
  const pad = (maxP - minP) * 0.06

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50"
    >
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-2xl shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <StockLogo symbol={symbol} />
            <div>
              <h2 className="text-white text-lg font-bold">{symbol}</h2>
              <p className="text-gray-500 text-xs">30-day price history</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none transition-colors">×</button>
        </div>

        {loading ? (
          <div className="h-52 flex items-center justify-center text-gray-500 text-sm">Loading chart…</div>
        ) : !data.length ? (
          <div className="h-52 flex items-center justify-center text-gray-500 text-sm">No data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
              <YAxis domain={[minP - pad, maxP + pad]} tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(0)}`} width={55} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#9ca3af', fontSize: 11 }}
                formatter={(v: number) => [`$${v.toFixed(2)}`, 'Close']}
              />
              <Line type="monotone" dataKey="close" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WatchlistPage() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [prices, setPrices] = useState<AssetPrice[]>([])
  const [charts, setCharts] = useState<Record<string, ChartPoint[]>>({})
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [loadingCharts, setLoadingCharts] = useState(false)
  const [newName, setNewName] = useState('')
  const [creatingWl, setCreatingWl] = useState(false)
  const [newSymbol, setNewSymbol] = useState('')
  const [addingSymbol, setAddingSymbol] = useState(false)
  const [addError, setAddError] = useState('')
  const [chartSymbol, setChartSymbol] = useState<string | null>(null)

  const selected = watchlists.find((w) => w.id === selectedId) ?? null

  useEffect(() => {
    watchlistsApi.list().then((wls) => {
      setWatchlists(wls)
      if (wls.length > 0) setSelectedId(wls[0].id)
    })
  }, [])

  useEffect(() => {
    if (!selectedId) { setPrices([]); setCharts({}); return }
    setLoadingPrices(true)
    setLoadingCharts(true)
    watchlistsApi.getPrices(selectedId).then(setPrices).finally(() => setLoadingPrices(false))
    watchlistsApi.getAllCharts(selectedId).then(setCharts).finally(() => setLoadingCharts(false))
  }, [selectedId, selected?.assets.length])

  async function handleCreateWatchlist(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setCreatingWl(true)
    try {
      const wl = await watchlistsApi.create(name)
      setWatchlists((prev) => [...prev, wl])
      setSelectedId(wl.id)
      setNewName('')
    } finally { setCreatingWl(false) }
  }

  async function handleDeleteWatchlist() {
    if (!selected) return
    await watchlistsApi.remove(selected.id)
    const remaining = watchlists.filter((w) => w.id !== selected.id)
    setWatchlists(remaining)
    setSelectedId(remaining[0]?.id ?? null)
  }

  async function handleAddSymbol(e: React.FormEvent) {
    e.preventDefault()
    const sym = newSymbol.trim().toUpperCase()
    if (!sym || !selectedId) return
    setAddingSymbol(true)
    setAddError('')
    try {
      const updated = await watchlistsApi.addAsset(selectedId, sym)
      setWatchlists((prev) => prev.map((w) => w.id === updated.id ? updated : w))
      setNewSymbol('')
    } catch (err: any) {
      setAddError(err.response?.data?.detail ?? 'Failed to add symbol')
    } finally { setAddingSymbol(false) }
  }

  async function handleRemoveAsset(symbol: string) {
    if (!selectedId) return
    const updated = await watchlistsApi.removeAsset(selectedId, symbol)
    setWatchlists((prev) => prev.map((w) => w.id === selectedId ? updated : w))
    setPrices((prev) => prev.filter((p) => p.symbol !== symbol))
    setCharts((prev) => { const n = { ...prev }; delete n[symbol]; return n })
  }

  const priceMap = Object.fromEntries(prices.map((p) => [p.symbol, p]))

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* ── Sidebar ── */}
      <div className="w-60 shrink-0 border-r border-gray-800/60 flex flex-col bg-gray-950">
        <div className="px-4 pt-5 pb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Watchlists</p>
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {watchlists.map((wl) => (
            <button
              key={wl.id}
              onClick={() => setSelectedId(wl.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all mb-0.5 ${
                wl.id === selectedId ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <span className="truncate block text-sm font-medium">{wl.name}</span>
              <span className="text-gray-600 text-xs">{wl.assets.length} stock{wl.assets.length !== 1 ? 's' : ''}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-gray-800/60 p-3">
          <form onSubmit={handleCreateWatchlist} className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New watchlist…"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={creatingWl || !newName.trim()}
              className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-2.5 py-1.5 rounded-lg transition-colors font-bold"
            >
              +
            </button>
          </form>
        </div>
      </div>

      {/* ── Main panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-600">
            <div className="text-4xl">📋</div>
            <p className="text-sm">Create a watchlist to get started</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-800/60 flex items-center gap-3 shrink-0">
              <div>
                <h1 className="text-white font-bold text-xl">{selected.name}</h1>
                <p className="text-gray-600 text-xs mt-0.5">{selected.assets.length} stocks</p>
              </div>
              <div className="ml-auto flex items-center gap-3">
                {/* Add stock */}
                <form onSubmit={handleAddSymbol} className="flex items-center gap-2">
                  <input
                    value={newSymbol}
                    onChange={(e) => { setNewSymbol(e.target.value); setAddError('') }}
                    placeholder="Add ticker, e.g. AAPL"
                    className="w-48 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-600 uppercase"
                  />
                  <button
                    type="submit"
                    disabled={addingSymbol || !newSymbol.trim()}
                    className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {addingSymbol ? 'Adding…' : '+ Add'}
                  </button>
                </form>
                {addError && <p className="text-red-400 text-xs">{addError}</p>}
                <button
                  onClick={handleDeleteWatchlist}
                  className="text-xs text-gray-600 hover:text-red-400 border border-gray-800 hover:border-red-900/60 px-3 py-2 rounded-lg transition-all whitespace-nowrap"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Table */}
            {selected.assets.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                No stocks yet — add one above
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800/60 text-gray-500 text-xs">
                      <th className="text-left py-3 px-6 font-medium">Symbol</th>
                      <th className="py-3 px-4 font-medium text-center">7d trend</th>
                      <th className="text-right py-3 px-4 font-medium">Price</th>
                      <th className="text-right py-3 px-4 font-medium">Change</th>
                      <th className="text-right py-3 px-4 font-medium">Day High</th>
                      <th className="text-right py-3 px-6 font-medium">Day Low</th>
                      <th className="py-3 px-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {selected.assets.map((asset) => {
                      const p = priceMap[asset.symbol]
                      const positive = (p?.change_pct ?? 0) >= 0
                      const sparkData = (charts[asset.symbol] ?? []).slice(-7)
                      const changeColor = positive ? 'text-emerald-400' : 'text-red-400'
                      const arrow = positive ? '▲' : '▼'

                      return (
                        <tr
                          key={asset.symbol}
                          onClick={() => setChartSymbol(asset.symbol)}
                          className="border-b border-gray-800/40 hover:bg-gray-800/30 cursor-pointer transition-colors group"
                        >
                          {/* Symbol + logo */}
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <StockLogo symbol={asset.symbol} />
                              <span className="font-bold text-white text-sm">{asset.symbol}</span>
                            </div>
                          </td>

                          {/* Sparkline */}
                          <td className="py-4 px-4">
                            <div className="flex justify-center">
                              {loadingCharts ? (
                                <div className="w-20 h-8 rounded bg-gray-800/60 animate-pulse" />
                              ) : (
                                <Sparkline data={sparkData} positive={positive} />
                              )}
                            </div>
                          </td>

                          {/* Price */}
                          <td className="py-4 px-4 text-right">
                            {loadingPrices ? (
                              <span className="text-gray-600">—</span>
                            ) : p?.price != null ? (
                              <span className="text-white font-semibold text-sm">${p.price.toFixed(2)}</span>
                            ) : (
                              <span className="text-gray-600 text-sm">N/A</span>
                            )}
                          </td>

                          {/* Change */}
                          <td className="py-4 px-4 text-right">
                            {loadingPrices ? (
                              <span className="text-gray-600">—</span>
                            ) : p?.change_pct != null ? (
                              <span className={`text-sm font-medium ${changeColor}`}>
                                {arrow} {positive ? '+' : ''}{p.change_pct.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-gray-600 text-sm">N/A</span>
                            )}
                          </td>

                          {/* High */}
                          <td className="py-4 px-4 text-right text-gray-400 text-sm">
                            {loadingPrices ? '—' : p?.day_high != null ? `$${p.day_high.toFixed(2)}` : '—'}
                          </td>

                          {/* Low */}
                          <td className="py-4 px-6 text-right text-gray-400 text-sm">
                            {loadingPrices ? '—' : p?.day_low != null ? `$${p.day_low.toFixed(2)}` : '—'}
                          </td>

                          {/* Remove */}
                          <td className="py-4 px-4">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveAsset(asset.symbol) }}
                              className="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-lg leading-none"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {chartSymbol && (
        <ChartModal symbol={chartSymbol} onClose={() => setChartSymbol(null)} />
      )}
    </div>
  )
}
