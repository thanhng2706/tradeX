import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { backtestsApi, BacktestResult } from '../api/backtests'
import { strategiesApi, Strategy } from '../api/strategies'

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals)
}

function MetricCard({ label, value, sub, note, color }: { label: string; value: string; sub?: string; note?: string; color?: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-gray-600 text-xs mt-0.5">{sub}</p>}
      {note && <p className="text-gray-600 text-[11px] italic mt-1">{note}</p>}
    </div>
  )
}

function toDateInput(d: Date) {
  return d.toISOString().split('T')[0]
}

const EVENT_META: Record<string, { label: string; color: string; dot: string }> = {
  BUY_SIGNAL: { label: 'Buy Signal', color: 'text-blue-400', dot: 'bg-blue-400' },
  SELL_SIGNAL: { label: 'Sell Signal', color: 'text-purple-400', dot: 'bg-purple-400' },
  SIGNAL_SUPPRESSED: { label: 'Signal Suppressed', color: 'text-yellow-500', dot: 'bg-yellow-500' },
  ORDER_FILLED: { label: 'Order Filled', color: 'text-green-400', dot: 'bg-green-400' },
  BACKTEST_COMPLETE: { label: 'Complete', color: 'text-gray-400', dot: 'bg-gray-400' },
}

export default function BacktestPage() {
  const { portfolioId, strategyId } = useParams<{ portfolioId: string; strategyId: string }>()
  const navigate = useNavigate()

  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 2)
    return toDateInput(d)
  })
  const [endDate, setEndDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 5)
    return toDateInput(d)
  })
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [error, setError] = useState('')
  const [showTrades, setShowTrades] = useState(false)
  const [showEvents, setShowEvents] = useState(false)

  useEffect(() => {
    strategiesApi.list(Number(portfolioId)).then((list) => {
      const s = list.find((s) => s.id === Number(strategyId))
      if (s) setStrategy(s)
    })
  }, [portfolioId, strategyId])

  // Restore the most recent saved backtest for this strategy, so revisiting the page
  // doesn't show a blank slate when a result already exists.
  useEffect(() => {
    backtestsApi.list(Number(strategyId)).then((list) => {
      const latest = list[0]
      if (latest) {
        setResult(latest)
        setStartDate(latest.start_date)
        setEndDate(latest.end_date)
      }
    })
  }, [strategyId])

  async function handleRun() {
    setRunning(true)
    setError('')
    setResult(null)
    try {
      const res = await backtestsApi.run(Number(strategyId), startDate, endDate)
      setResult(res)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Backtest failed')
    } finally {
      setRunning(false)
    }
  }

  const returnColor = result
    ? result.total_return_pct >= 0 ? 'text-green-400' : 'text-red-400'
    : 'text-white'

  // Thin out equity curve for chart performance (max 300 points)
  const chartData = result
    ? result.equity_curve
        .map((p, i) => ({
          date: p.date,
          value: p.value,
          benchmark: result.benchmark_equity_curve?.[i]?.value,
        }))
        .filter((_, i) =>
          i % Math.max(1, Math.floor(result.equity_curve.length / 300)) === 0
        )
    : []

  const alphaPct = result && result.benchmark_return_pct != null
    ? result.total_return_pct - result.benchmark_return_pct
    : null

  return (
    <div>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <button onClick={() => navigate(`/portfolios/${portfolioId}`)} className="hover:text-gray-300 transition-colors">
            ← {strategy?.name ?? 'Strategy'}
          </button>
          <span className="text-gray-700">/</span>
          <span className="text-gray-300">Backtest</span>
        </div>
        <div className="flex items-center gap-3 mb-8">
          <h1 className="text-2xl font-bold">{strategy?.name ?? '...'}</h1>
          <span className="text-xs bg-gray-800 border border-gray-700/60 text-gray-400 px-2 py-1 rounded font-mono">{strategy?.ticker}</span>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 pb-10 space-y-8">
        {/* Config */}
        <div className="bg-gray-900 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Run Backtest</h2>
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleRun}
              disabled={running}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
            >
              {running ? 'Running...' : 'Run Backtest'}
            </button>
          </div>
          {running && (
            <p className="text-gray-500 text-sm mt-3">
              Fetching price data and running simulation — this takes a few seconds...
            </p>
          )}
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </div>

        {result && (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MetricCard
                label="Total Return"
                value={`${result.total_return_pct >= 0 ? '+' : ''}${fmt(result.total_return_pct)}%`}
                sub={`$${result.starting_balance.toLocaleString()} → $${result.final_balance.toLocaleString()}`}
                color={returnColor}
              />
              <MetricCard
                label="Annualized Return"
                value={`${result.annualized_return_pct >= 0 ? '+' : ''}${fmt(result.annualized_return_pct)}%`}
                color={result.annualized_return_pct >= 0 ? 'text-green-400' : 'text-red-400'}
              />
              <MetricCard
                label="Sharpe Ratio"
                value={fmt(result.sharpe_ratio, 3)}
                sub={result.sharpe_ratio >= 1 ? 'Good' : result.sharpe_ratio >= 0.5 ? 'Fair' : 'Poor'}
              />
              <MetricCard
                label="Max Drawdown"
                value={`${fmt(result.max_drawdown_pct)}%`}
                color="text-red-400"
              />
              <MetricCard
                label="Win Rate"
                value={`${fmt(result.win_rate)}%`}
                sub={`${result.num_trades} trade${result.num_trades !== 1 ? 's' : ''}`}
              />
              <MetricCard
                label="Final Balance"
                value={`$${result.final_balance.toLocaleString()}`}
              />
              {alphaPct != null && (
                <MetricCard
                  label="vs Buy & Hold"
                  value={`${alphaPct >= 0 ? '+' : ''}${fmt(alphaPct)}pp`}
                  sub={`Buy & hold ${strategy?.ticker ?? ''}: ${result.benchmark_return_pct! >= 0 ? '+' : ''}${fmt(result.benchmark_return_pct!)}%`}
                  note={strategy ? `Benchmark assumes 100% allocation; your strategy sizes positions at ${strategy.position_size_pct}%` : undefined}
                  color={alphaPct >= 0 ? 'text-green-400' : 'text-red-400'}
                />
              )}
            </div>

            {/* Equity curve */}
            <div className="bg-gray-900 rounded-xl p-6">
              <h2 className="font-semibold mb-4">Equity Curve</h2>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickFormatter={(v) => v.slice(0, 7)}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    width={55}
                  />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                    labelStyle={{ color: '#9ca3af' }}
                    formatter={(v: number, name: string) => [`$${v.toLocaleString()}`, name]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value) => <span style={{ color: '#9ca3af' }}>{value}</span>}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="Strategy"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    name={`Buy & Hold ${strategy?.ticker ?? ''}`}
                    stroke="#6b7280"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* AI Explanation */}
            {result.ai_explanation && (
              <div className="bg-gray-900 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-blue-400 text-sm font-medium">AI Analysis</span>
                </div>
                <div className="text-gray-300 text-sm leading-relaxed space-y-3">
                  {result.ai_explanation
                    .split('\n\n')
                    .filter((p) => !p.startsWith('#'))
                    .map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                </div>
              </div>
            )}

            {/* Trade log */}
            {result.trades.length > 0 && (
              <div className="bg-gray-900 rounded-xl p-6">
                <button
                  onClick={() => setShowTrades((v) => !v)}
                  className="flex items-center gap-2 font-semibold text-sm w-full text-left"
                >
                  <span>Trade Log</span>
                  <span className="text-gray-500">({result.trades.length} trades)</span>
                  <span className="ml-auto text-gray-500">{showTrades ? '▲' : '▼'}</span>
                </button>
                {showTrades && (() => {
                  const isOptions = strategy?.asset_type === 'option'
                  return (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 text-xs border-b border-gray-800">
                          <th className="text-left pb-2">Date</th>
                          <th className="text-left pb-2">Action</th>
                          {isOptions ? (
                            <>
                              <th className="text-left pb-2">Strike/Exp</th>
                              <th className="text-right pb-2">Premium</th>
                              <th className="text-right pb-2">Contracts</th>
                            </>
                          ) : (
                            <>
                              <th className="text-right pb-2">Price</th>
                              <th className="text-right pb-2">Shares</th>
                            </>
                          )}
                          <th className="text-right pb-2">Value</th>
                          <th className="text-right pb-2">P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.trades.map((t, i) => (
                          <tr key={i} className="border-b border-gray-800/50 text-gray-400">
                            <td className="py-2 font-mono text-xs">{t.date}</td>
                            <td className={`py-2 font-medium ${t.action.startsWith('BUY') ? 'text-green-400' : 'text-red-400'}`}>
                              {t.action}{t.reason ? <span className="text-gray-600 text-xs ml-1">({t.reason})</span> : null}
                            </td>
                            {isOptions ? (
                              <>
                                <td className="py-2 text-left font-mono text-xs">
                                  {t.option_type} ${t.strike} · {t.expiration}
                                </td>
                                <td className="py-2 text-right">${t.premium}</td>
                                <td className="py-2 text-right">{t.contracts}</td>
                              </>
                            ) : (
                              <>
                                <td className="py-2 text-right">${t.price}</td>
                                <td className="py-2 text-right">{t.shares}</td>
                              </>
                            )}
                            <td className="py-2 text-right">${t.value.toLocaleString()}</td>
                            <td className={`py-2 text-right ${t.pnl !== undefined ? (t.pnl >= 0 ? 'text-green-400' : 'text-red-400') : ''}`}>
                              {t.pnl !== undefined ? `${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )
                })()}
              </div>
            )}

            {/* Event Timeline */}
            {result.events.length > 0 && (
              <div className="bg-gray-900 rounded-xl p-6">
                <button
                  onClick={() => setShowEvents((v) => !v)}
                  className="flex items-center gap-2 font-semibold text-sm w-full text-left"
                >
                  <span>Event Timeline</span>
                  <span className="text-gray-500">({result.events.length} event{result.events.length !== 1 ? 's' : ''})</span>
                  <span className="ml-auto text-gray-500">{showEvents ? '▲' : '▼'}</span>
                </button>
                {showEvents && (
                  <div className="mt-4 space-y-2.5 max-h-96 overflow-y-auto">
                    {result.events_truncated && (
                      <p className="text-yellow-500 text-xs mb-2">
                        Event log truncated to the most recent {result.events.length} events.
                      </p>
                    )}
                    {result.events.map((e, i) => {
                      const meta = EVENT_META[e.type] ?? { label: e.type, color: 'text-gray-400', dot: 'bg-gray-500' }
                      return (
                        <div key={i} className="flex items-start gap-3 text-sm">
                          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-gray-500">{e.date}</span>
                              <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                            </div>
                            <p className="text-gray-400 text-sm">{e.message}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

