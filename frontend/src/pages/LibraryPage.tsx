import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { libraryApi, LibraryStrategy } from '../api/library'
import api from '../api/client'

interface Portfolio {
  id: number
  name: string
}

const CATEGORIES = ['All', 'Long Term', 'ETFs', 'Active Trading', 'Leveraged']

const CATEGORY_COLORS: Record<string, string> = {
  'Long Term':     'bg-blue-900/40 text-blue-300 border-blue-800/60',
  'ETFs':          'bg-emerald-900/40 text-emerald-300 border-emerald-800/60',
  'Active Trading':'bg-purple-900/40 text-purple-300 border-purple-800/60',
  'Leveraged':     'bg-orange-900/40 text-orange-300 border-orange-800/60',
}

function conditionSummary(conditions: any): string {
  const rules = conditions?.rules ?? []
  if (rules.length === 0) return 'No conditions'
  return rules.map((r: any) => {
    const leftParams = Object.values(r.params ?? {})
    const left = leftParams.length > 0 ? `${r.indicator}(${leftParams.join(',')})` : r.indicator
    if (r.right_indicator) {
      const rightParams = Object.values(r.right_params ?? {})
      const right = rightParams.length > 0 ? `${r.right_indicator}(${rightParams.join(',')})` : r.right_indicator
      return `${left} ${r.operator} ${right}`
    }
    return `${left} ${r.operator} ${r.value}`
  }).join(` ${conditions.logic} `)
}

function CopyModal({
  strategy,
  portfolios,
  defaultPortfolioId,
  onClose,
  onCopied,
}: {
  strategy: LibraryStrategy
  portfolios: Portfolio[]
  defaultPortfolioId: number | null
  onClose: () => void
  onCopied: (portfolioName: string) => void
}) {
  const [selectedId, setSelectedId] = useState<number | null>(defaultPortfolioId ?? portfolios[0]?.id ?? null)
  const [copying, setCopying] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleCopy() {
    if (!selectedId) return
    setCopying(true)
    try {
      await libraryApi.copyToPortfolio(strategy.id, selectedId)
      const name = portfolios.find((p) => p.id === selectedId)?.name ?? 'portfolio'
      onCopied(name)
    } finally {
      setCopying(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div ref={ref} className="bg-gray-900 border border-gray-800/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="font-semibold text-white mb-1">Copy to Portfolio</h2>
        <p className="text-gray-500 text-sm mb-5">
          Select a portfolio to add <span className="text-gray-300">{strategy.name}</span> to.
        </p>

        {portfolios.length === 0 ? (
          <p className="text-gray-500 text-sm mb-4">No portfolios yet. Create one first.</p>
        ) : (
          <div className="space-y-2 mb-5">
            {portfolios.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm ${
                  selectedId === p.id
                    ? 'bg-blue-600/20 border-blue-500/60 text-white'
                    : 'bg-gray-800 border-gray-700/60 text-gray-300 hover:border-gray-600'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCopy}
            disabled={copying || !selectedId || portfolios.length === 0}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
          >
            {copying ? 'Copying...' : 'Copy Strategy'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StrategyCard({
  strategy,
  onCopy,
}: {
  strategy: LibraryStrategy
  onCopy: (s: LibraryStrategy) => void
}) {
  return (
    <div className="bg-gray-900 border border-gray-800/60 hover:border-gray-700/80 rounded-xl p-5 flex flex-col gap-3 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-white text-sm">{strategy.name}</span>
            <span className="text-xs font-mono bg-gray-800 border border-gray-700/60 text-gray-400 px-1.5 py-0.5 rounded">
              {strategy.ticker}
            </span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded border ${CATEGORY_COLORS[strategy.category] ?? 'bg-gray-800 text-gray-400 border-gray-700/60'}`}>
            {strategy.category}
          </span>
        </div>
        <span className="text-xs text-gray-600 shrink-0">{strategy.position_size_pct}% size</span>
      </div>

      <p className="text-gray-500 text-xs leading-relaxed">{strategy.description}</p>

      <div className="space-y-1">
        <p className="text-xs font-mono text-gray-700 truncate">
          <span className="text-green-500 mr-1">BUY</span>
          {conditionSummary(strategy.buy_conditions)}
        </p>
        <p className="text-xs font-mono text-gray-700 truncate">
          <span className="text-red-500 mr-1">SELL</span>
          {conditionSummary(strategy.sell_conditions)}
        </p>
      </div>

      <button
        onClick={() => onCopy(strategy)}
        className="mt-auto w-full py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
      >
        Copy to Portfolio
      </button>
    </div>
  )
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromPortfolioId = searchParams.get('portfolio') ? Number(searchParams.get('portfolio')) : null
  const [strategies, setStrategies] = useState<LibraryStrategy[]>([])
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [activeCategory, setActiveCategory] = useState('All')
  const [copying, setCopying] = useState<LibraryStrategy | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    libraryApi.list().then(setStrategies)
    api.get<Portfolio[]>('/portfolios').then((r) => setPortfolios(r.data))
  }, [])

  const fromPortfolio = fromPortfolioId ? portfolios.find((p) => p.id === fromPortfolioId) : null

  const filtered = activeCategory === 'All'
    ? strategies
    : strategies.filter((s) => s.category === activeCategory)

  function handleCopied(portfolioName: string) {
    setCopying(null)
    setToast(`Copied to ${portfolioName}`)
    setTimeout(() => setToast(''), 3000)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        {fromPortfolio && (
          <Link to={`/portfolios/${fromPortfolio.id}`} className="text-sm text-gray-500 hover:text-gray-300 transition-colors inline-flex items-center gap-1 mb-3">
            ← Back to {fromPortfolio.name}
          </Link>
        )}
        <h1 className="text-2xl font-bold text-white mb-1">Strategy Library</h1>
        <p className="text-gray-500 text-sm">
          {fromPortfolio
            ? <>Copy a strategy straight into <span className="text-gray-300">{fromPortfolio.name}</span>, or browse for later.</>
            : 'Browse pre-built strategies. Copy one to your portfolio to backtest and customize it.'}
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3.5 py-1.5 rounded-lg text-sm transition-colors ${
              activeCategory === cat
                ? 'bg-blue-600 text-white'
                : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800/60'
            }`}
          >
            {cat}
            {cat !== 'All' && (
              <span className="ml-1.5 text-xs opacity-60">
                {strategies.filter((s) => s.category === cat).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((s) => (
          <StrategyCard key={s.id} strategy={s} onCopy={setCopying} />
        ))}
      </div>

      {/* Copy modal */}
      {copying && (
        <CopyModal
          strategy={copying}
          portfolios={portfolios}
          defaultPortfolioId={fromPortfolioId}
          onClose={() => setCopying(null)}
          onCopied={handleCopied}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-700/60 text-white text-sm px-5 py-3 rounded-xl shadow-2xl">
          ✓ {toast} — go to your portfolio to backtest it
        </div>
      )}
    </div>
  )
}
