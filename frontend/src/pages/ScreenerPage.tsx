import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { researchApi, ScreenerResult } from '../api/research'

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
        className="w-9 h-9 rounded-full object-contain bg-gray-800"
      />
    )
  }
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
      style={{ background: bg }}
    >
      {initial}
    </div>
  )
}

function SparkleIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  )
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', VND: '₫', KRW: '₩',
  INR: '₹', HKD: 'HK$', CAD: 'C$', AUD: 'A$', CHF: 'CHF ', SGD: 'S$', BRL: 'R$',
}

function currencySymbol(code: string | null | undefined): string {
  if (!code) return '$'
  return CURRENCY_SYMBOLS[code] ?? `${code} `
}

function formatCompact(n: number | null | undefined, symbol = '$'): string {
  if (n == null) return 'N/A'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${symbol}${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${symbol}${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${symbol}${(n / 1e6).toFixed(2)}M`
  return `${symbol}${n.toFixed(2)}`
}

function peColor(pe: number | null): string {
  if (pe == null) return 'text-gray-600'
  return pe > 50 ? 'text-red-400' : 'text-emerald-400'
}

function RangeField({ label, min, max, onMin, onMax, unit }: {
  label: string; min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void; unit?: string
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input value={min} onChange={(e) => onMin(e.target.value)} type="number" placeholder="0"
          className="w-20 bg-transparent border border-gray-800 rounded-lg px-3 py-2 text-base text-white placeholder-gray-600 focus:outline-none focus:border-blue-600" />
        <span className="text-gray-600">–</span>
        <input value={max} onChange={(e) => onMax(e.target.value)} type="number" placeholder="no max"
          className="w-24 bg-transparent border border-gray-800 rounded-lg px-3 py-2 text-base text-white placeholder-gray-600 focus:outline-none focus:border-blue-600" />
        {unit && <span className="text-gray-500 text-sm">{unit}</span>}
      </div>
    </div>
  )
}

export default function ScreenerPage() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<string[]>([])
  const [category, setCategory] = useState<string>('')
  const [minMarketCap, setMinMarketCap] = useState('')
  const [maxMarketCap, setMaxMarketCap] = useState('')
  const [minPe, setMinPe] = useState('')
  const [maxPe, setMaxPe] = useState('')
  const [results, setResults] = useState<ScreenerResult[]>([])
  const [loading, setLoading] = useState(false)
  const [ran, setRan] = useState(false)
  const [askedQuery, setAskedQuery] = useState('')

  const [aiQuery, setAiQuery] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    researchApi.getCategories().then(setCategories)
  }, [])

  function resetFilters() {
    setCategory('')
    setMinMarketCap('')
    setMaxMarketCap('')
    setMinPe('')
    setMaxPe('')
    setAiQuery('')
    setAskedQuery('')
    setResults([])
    setRan(false)
  }

  async function handleRunScreener(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setRan(true)
    setAskedQuery('')
    try {
      const filters = {
        category: category || undefined,
        min_market_cap: minMarketCap ? parseFloat(minMarketCap) * 1e9 : undefined,
        max_market_cap: maxMarketCap ? parseFloat(maxMarketCap) * 1e9 : undefined,
        min_pe: minPe ? parseFloat(minPe) : undefined,
        max_pe: maxPe ? parseFloat(maxPe) : undefined,
      }
      const data = await researchApi.runScreener(filters)
      setResults(data)
    } finally {
      setLoading(false)
    }
  }

  async function handleAiScreen(e: React.FormEvent) {
    e.preventDefault()
    if (!aiQuery.trim()) return
    setAiLoading(true)
    setRan(true)
    try {
      const { filters, results: data } = await researchApi.runAiScreener(aiQuery.trim())
      setResults(data)
      setAskedQuery(aiQuery.trim())
      setCategory(filters.category ?? '')
      setMinMarketCap(filters.min_market_cap ? String(filters.min_market_cap / 1e9) : '')
      setMaxMarketCap(filters.max_market_cap ? String(filters.max_market_cap / 1e9) : '')
      setMinPe(filters.min_pe != null ? String(filters.min_pe) : '')
      setMaxPe(filters.max_pe != null ? String(filters.max_pe) : '')
    } finally {
      setAiLoading(false)
    }
  }

  const busy = loading || aiLoading

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Stock Screener</h1>
          <p className="text-gray-600 text-sm mt-0.5">Filter stocks by category and fundamentals, or ask Aria in plain English.</p>
        </div>
        <button onClick={resetFilters} title="Reset filters"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-white hover:bg-gray-800 transition-all text-lg leading-none">
          ···
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mt-6">
        <form onSubmit={handleRunScreener} className="flex flex-wrap items-end gap-6 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="bg-transparent border border-gray-800 rounded-lg px-3 py-2 text-base text-white focus:outline-none focus:border-blue-600">
              <option value="" className="bg-gray-900">All</option>
              {categories.map((c) => <option key={c} value={c} className="bg-gray-900">{c}</option>)}
            </select>
          </div>

          <RangeField label="Market cap" min={minMarketCap} max={maxMarketCap} onMin={setMinMarketCap} onMax={setMaxMarketCap} unit="$B" />
          <RangeField label="P/E ratio" min={minPe} max={maxPe} onMin={setMinPe} onMax={setMaxPe} />

          <button type="submit" disabled={busy}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors">
            {loading ? 'Screening…' : 'Run screener'}
          </button>
        </form>

        <form onSubmit={handleAiScreen} className="flex items-center gap-2 pt-4 border-t border-gray-800/60">
          <span className="text-blue-400 shrink-0"><SparkleIcon /></span>
          <input
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            placeholder="Ask Aria — e.g. profitable EV companies with PE under 30"
            className="flex-1 bg-transparent text-sm text-gray-300 placeholder-gray-600 focus:outline-none"
          />
          {aiQuery.trim() && (
            <button type="submit" disabled={busy}
              className="text-blue-400 hover:text-blue-300 disabled:opacity-40 text-xs font-medium shrink-0">
              {aiLoading ? 'Asking…' : 'Ask →'}
            </button>
          )}
        </form>
      </div>

      {ran && (
        <div className="mt-4 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {askedQuery && !busy && (
            <div className="px-5 py-3 border-b border-gray-800/60 text-sm text-gray-400 flex items-center gap-2">
              <span className="text-blue-400"><SparkleIcon /></span>
              Ask Aria — {askedQuery}
            </div>
          )}
          {busy ? (
            <div className="p-8 text-center text-gray-500 text-sm">Screening stocks…</div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No stocks matched your criteria.</div>
          ) : (
            <>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3 text-gray-500 text-xs uppercase tracking-wide">
                <span>Symbol</span>
                <span className="text-right">Price</span>
                <span className="text-right">Market Cap</span>
                <span className="text-right">P/E</span>
                <span className="text-right">Revenue</span>
              </div>
              {results.map((r) => {
                const cur = currencySymbol(r.currency)
                return (
                  <div key={r.symbol} onClick={() => navigate(`/stock/${r.symbol}`)}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3.5 items-center hover:bg-gray-800/40 cursor-pointer transition-colors border-t border-gray-800/40">
                    <span className="flex items-center gap-3 min-w-0">
                      <StockLogo symbol={r.symbol} />
                      <span className="truncate">
                        <span className="font-bold text-white">{r.symbol}</span>
                        <span className="text-gray-500 text-xs ml-2">{r.name}</span>
                      </span>
                    </span>
                    <span className="text-right text-white font-medium">{r.price != null ? `${cur}${r.price.toFixed(2)}` : 'N/A'}</span>
                    <span className="text-right text-gray-300">{formatCompact(r.market_cap, cur)}</span>
                    <span className={`text-right font-medium ${peColor(r.pe_ratio)}`}>{r.pe_ratio != null ? r.pe_ratio.toFixed(1) : 'N/A'}</span>
                    <span className="text-right text-gray-300">{formatCompact(r.revenue, cur)}</span>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
