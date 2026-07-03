import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { optimizerApi, OptimizedResult } from '../api/optimizer'
import { strategiesApi, Strategy } from '../api/strategies'

function fmt(n: number, d = 2) {
  return n.toFixed(d)
}

function conditionSummary(conditions: Record<string, any>): string {
  const rules = conditions?.rules ?? []
  if (rules.length === 0) return 'No rules'
  return rules.map((r: any) => {
    const period = r.params?.period ? `(${r.params.period})` : ''
    const val = typeof r.value === 'number' ? r.value.toFixed(2) : (r.value ?? '')
    return `${r.indicator}${period} ${r.operator} ${val}`
  }).join(` ${conditions.logic} `)
}

function toDateInput(d: Date) {
  return d.toISOString().split('T')[0]
}

export default function OptimizerPage() {
  const { portfolioId, strategyId } = useParams<{ portfolioId: string; strategyId: string }>()
  const navigate = useNavigate()

  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 2); return toDateInput(d)
  })
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 5); return toDateInput(d)
  })
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<OptimizedResult[] | null>(null)
  const [error, setError] = useState('')
  const [applying, setApplying] = useState<number | null>(null)

  useEffect(() => {
    strategiesApi.list(Number(portfolioId)).then((list) => {
      const s = list.find((s) => s.id === Number(strategyId))
      if (s) setStrategy(s)
    })
  }, [portfolioId, strategyId])

  async function handleRun() {
    setRunning(true)
    setError('')
    setResults(null)
    try {
      const res = await optimizerApi.run(Number(strategyId), startDate, endDate)
      setResults(res.results)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Optimization failed')
    } finally {
      setRunning(false)
    }
  }

  async function handleApply(result: OptimizedResult) {
    setApplying(result.rank)
    try {
      await optimizerApi.apply(Number(strategyId), result)
      navigate(`/portfolios/${portfolioId}/strategies/${strategyId}/backtest`)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to apply')
      setApplying(null)
    }
  }

  return (
    <div>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <button onClick={() => navigate(`/portfolios/${portfolioId}`)} className="hover:text-gray-300 transition-colors">
            ← {strategy?.name ?? 'Strategy'}
          </button>
          <span className="text-gray-700">/</span>
          <span className="text-gray-300">Optimizer</span>
        </div>
        <div className="flex items-center gap-3 mb-8">
          <h1 className="text-2xl font-bold">{strategy?.name ?? '...'}</h1>
          <span className="text-xs bg-gray-800 border border-gray-700/60 text-gray-400 px-2 py-1 rounded font-mono">{strategy?.ticker}</span>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 pb-10 space-y-8">
        {/* Config */}
        <div className="bg-gray-900 rounded-xl p-6">
          <h2 className="font-semibold mb-1">Genetic Algorithm Optimizer</h2>
          <p className="text-gray-500 text-sm mb-5">
            Runs ~300 backtests to find the best RSI period and threshold values for your strategy.
            Takes 20–40 seconds.
          </p>
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button
              onClick={handleRun}
              disabled={running}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
            >
              {running ? 'Optimizing...' : 'Run Optimizer'}
            </button>
          </div>
          {running && (
            <div className="mt-4">
              <p className="text-gray-400 text-sm">Running genetic algorithm — 20 individuals × 15 generations...</p>
              <div className="mt-2 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-purple-600 rounded-full animate-pulse w-3/4" />
              </div>
            </div>
          )}
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </div>

        {/* Results */}
        {results && results.length === 0 && (
          <div className="bg-gray-900 rounded-xl p-6 text-gray-500 text-sm">
            No valid configurations found. Try a longer date range.
          </div>
        )}

        {results && results.length > 0 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg">Top {results.length} Results</h2>
            {results.map((r) => (
              <div
                key={r.rank}
                className={`bg-gray-900 rounded-xl p-5 border ${r.rank === 1 ? 'border-purple-600' : 'border-transparent'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${r.rank === 1 ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                      #{r.rank}
                    </span>
                    {r.rank === 1 && (
                      <span className="text-purple-400 text-xs font-medium">Best Found</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleApply(r)}
                    disabled={applying !== null}
                    className="text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors shrink-0"
                  >
                    {applying === r.rank ? 'Applying...' : 'Apply & Backtest'}
                  </button>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
                  {[
                    { label: 'Return', value: `${r.total_return_pct >= 0 ? '+' : ''}${fmt(r.total_return_pct)}%`, green: r.total_return_pct >= 0 },
                    { label: 'Ann. Return', value: `${r.annualized_return_pct >= 0 ? '+' : ''}${fmt(r.annualized_return_pct)}%`, green: r.annualized_return_pct >= 0 },
                    { label: 'Sharpe', value: fmt(r.sharpe_ratio, 3) },
                    { label: 'Drawdown', value: `${fmt(r.max_drawdown_pct)}%`, red: true },
                    { label: 'Win Rate', value: `${fmt(r.win_rate)}%` },
                    { label: 'Trades', value: String(r.num_trades) },
                  ].map(({ label, value, green, red }) => (
                    <div key={label}>
                      <p className="text-gray-600 text-xs">{label}</p>
                      <p className={`font-semibold text-sm ${green ? 'text-green-400' : red ? 'text-red-400' : 'text-white'}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Conditions */}
                <div className="space-y-1.5">
                  <div className="flex gap-2 text-xs">
                    <span className="text-green-500 font-medium w-10 shrink-0">BUY</span>
                    <span className="text-gray-400 font-mono">{conditionSummary(r.buy_conditions)}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="text-red-500 font-medium w-10 shrink-0">SELL</span>
                    <span className="text-gray-400 font-mono">{conditionSummary(r.sell_conditions)}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="text-gray-500 font-medium w-10 shrink-0">SIZE</span>
                    <span className="text-gray-400 font-mono">{r.position_size_pct}% of portfolio per trade</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
