import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { researchApi, Quote } from '../api/research'
import { getHistory } from '../utils/researchHistory'
import ScreenerTab from './ScreenerPage'
import DeepDiveTab from './DeepDivePage'
import WatchlistsTab from './WatchlistPage'

const POPULAR = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN', 'META', 'SPY']

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

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', VND: '₫', KRW: '₩',
  INR: '₹', HKD: 'HK$', CAD: 'C$', AUD: 'A$', CHF: 'CHF ', SGD: 'S$', BRL: 'R$',
}

function currencySymbol(code: string | null | undefined): string {
  if (!code) return '$'
  return CURRENCY_SYMBOLS[code] ?? `${code} `
}

function TickerGrid({ symbols, quotes, onSelect }: { symbols: string[]; quotes: Record<string, Quote>; onSelect: (s: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {symbols.map((sym) => {
        const q = quotes[sym]
        const positive = (q?.change_pct ?? 0) >= 0
        const cur = currencySymbol(q?.currency)
        return (
          <button
            key={sym}
            onClick={() => onSelect(sym)}
            className="flex items-center gap-3 bg-gray-900 border border-gray-800 hover:border-blue-600 rounded-xl px-4 py-3 transition-all text-left"
          >
            <StockLogo symbol={sym} />
            <div className="min-w-0">
              <p className="text-white text-sm font-bold">{sym}</p>
              {q?.price != null ? (
                <p className="text-xs text-gray-500">
                  {cur}{q.price.toFixed(2)}{' '}
                  <span className={positive ? 'text-emerald-400' : 'text-red-400'}>
                    {positive ? '▲' : '▼'} {q.change_pct != null ? `${Math.abs(q.change_pct).toFixed(2)}%` : ''}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-gray-600">—</p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function SearchTab() {
  const [query, setQuery] = useState('')
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [history, setHistory] = useState<string[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    const recent = getHistory()
    setHistory(recent)
    const symbols = Array.from(new Set([...POPULAR, ...recent]))
    researchApi.getQuotes(symbols).then((data) => {
      setQuotes(Object.fromEntries(data.map((q) => [q.symbol, q])))
    })
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const sym = query.trim().toUpperCase()
    if (!sym) return
    navigate(`/stock/${sym}`)
  }

  return (
    <div className="flex flex-col items-center px-6 py-16 min-h-[calc(100vh-3.5rem)] bg-gray-950 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.15),transparent)]">
      <h1 className="text-white text-3xl font-bold mb-2">Stock Research</h1>
      <p className="text-gray-500 text-sm mb-8">Search any ticker for fundamentals, charts, and AI-powered analysis.</p>

      <form onSubmit={handleSearch} className="w-full max-w-lg flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a symbol, e.g. AAPL"
          autoFocus
          className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-600 uppercase"
        />
        <button
          type="submit"
          disabled={!query.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
        >
          Search
        </button>
      </form>

      {history.length > 0 && (
        <div className="w-full max-w-2xl mt-12">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Recently Viewed</p>
          <TickerGrid symbols={history} quotes={quotes} onSelect={(s) => navigate(`/stock/${s}`)} />
        </div>
      )}

      <div className="w-full max-w-2xl mt-10">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Trending</p>
        <TickerGrid symbols={POPULAR} quotes={quotes} onSelect={(s) => navigate(`/stock/${s}`)} />
      </div>
    </div>
  )
}

type TabKey = 'search' | 'screener' | 'deepdive' | 'watchlists'

export default function ResearchPage() {
  const [searchParams] = useSearchParams()
  const tab = (searchParams.get('tab') as TabKey) || 'search'

  return (
    <div className="bg-gray-950">
      {tab === 'search' && <SearchTab />}
      {tab === 'screener' && <ScreenerTab />}
      {tab === 'deepdive' && <DeepDiveTab />}
      {tab === 'watchlists' && <WatchlistsTab />}
    </div>
  )
}
