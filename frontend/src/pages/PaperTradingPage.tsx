import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { paperTradingApi, PaperStatus, PaperTradeRecord } from '../api/paper_trading'
import { strategiesApi, Strategy } from '../api/strategies'

function fmt(n: number, d = 2) { return n.toFixed(d) }

const EVENT_META: Record<string, { label: string; color: string; dot: string }> = {
  BUY_SIGNAL: { label: 'Buy Signal', color: 'text-blue-400', dot: 'bg-blue-400' },
  SELL_SIGNAL: { label: 'Sell Signal', color: 'text-purple-400', dot: 'bg-purple-400' },
  SIGNAL_SUPPRESSED: { label: 'Signal Suppressed', color: 'text-yellow-500', dot: 'bg-yellow-500' },
  ORDER_FILLED: { label: 'Order Filled', color: 'text-green-400', dot: 'bg-green-400' },
  BACKTEST_COMPLETE: { label: 'Complete', color: 'text-gray-400', dot: 'bg-gray-400' },
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 7 ? 'bg-green-600' : score >= 4 ? 'bg-yellow-600' : 'bg-red-600'
  return (
    <span className={`${color} text-white text-2xl font-bold w-12 h-12 rounded-full flex items-center justify-center`}>
      {score}
    </span>
  )
}

function parseHealthReport(report: string) {
  const sections: Record<string, string> = {}
  let current = ''
  for (const line of report.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('SCORE:')) continue
    if (['VERDICT:', 'STRENGTHS:', 'CONCERNS:', 'SUGGESTIONS:'].some(h => trimmed.startsWith(h))) {
      current = trimmed.replace(':', '').trim()
      sections[current] = ''
    } else if (current) {
      sections[current] = (sections[current] + '\n' + trimmed).trim()
    }
  }
  return sections
}

export default function PaperTradingPage() {
  const { portfolioId, strategyId } = useParams<{ portfolioId: string; strategyId: string }>()
  const navigate = useNavigate()

  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [status, setStatus] = useState<PaperStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState(false)
  const [checkingHealth, setCheckingHealth] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState('')
  const [showEvents, setShowEvents] = useState(false)

  useEffect(() => {
    async function load() {
      const list = await strategiesApi.list(Number(portfolioId))
      const s = list.find((s) => s.id === Number(strategyId))
      if (s) setStrategy(s)

      try {
        const st = await paperTradingApi.getStatus(Number(strategyId))
        setStatus(st)
      } catch {
        // no active paper trade
      }
      setLoading(false)
    }
    load()
  }, [portfolioId, strategyId])

  async function handleActivate() {
    setActivating(true)
    setError('')
    try {
      await paperTradingApi.activate(Number(strategyId))
      const st = await paperTradingApi.getStatus(Number(strategyId))
      setStatus(st)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to activate')
    } finally {
      setActivating(false)
    }
  }

  async function handleStop() {
    setStopping(true)
    try {
      await paperTradingApi.deactivate(Number(strategyId))
      setStatus(null)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to stop')
    } finally {
      setStopping(false)
    }
  }

  async function handleHealthCheck() {
    setCheckingHealth(true)
    setError('')
    try {
      const updated = await paperTradingApi.runHealthCheck(Number(strategyId))
      setStatus((prev) => prev ? { ...prev, paper_trade: updated } : prev)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Health check failed')
    } finally {
      setCheckingHealth(false)
    }
  }

  const isActive = !!status
  const pt: PaperTradeRecord | null = status?.paper_trade ?? null
  const healthSections = pt?.health_report ? parseHealthReport(pt.health_report) : null

  const chartData = status?.equity_curve?.filter((_, i) =>
    i % Math.max(1, Math.floor((status.equity_curve.length) / 200)) === 0
  ) ?? []

  return (
    <div>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <button onClick={() => navigate(`/portfolios/${portfolioId}`)} className="hover:text-gray-300 transition-colors">
            ← {strategy?.name ?? 'Strategy'}
          </button>
          <span className="text-gray-700">/</span>
          <span className="text-gray-300">Paper Trading</span>
        </div>
        <div className="flex items-center gap-3 mb-8">
          <h1 className="text-2xl font-bold">{strategy?.name ?? '...'}</h1>
          <span className="text-xs bg-gray-800 border border-gray-700/60 text-gray-400 px-2 py-1 rounded font-mono">{strategy?.ticker}</span>
          {isActive && (
            <span className="text-xs bg-green-900/40 text-green-400 border border-green-800/60 px-2.5 py-1 rounded-full">
              LIVE since {pt?.started_at}
            </span>
          )}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 pb-10 space-y-8">
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : !isActive ? (
          <div className="bg-gray-900 rounded-xl p-8 text-center">
            <h2 className="text-lg font-semibold mb-2">Paper Trading Not Active</h2>
            <p className="text-gray-500 text-sm mb-6">
              Activate to start tracking this strategy with today as your start date.
              Performance is calculated in real-time using market data.
            </p>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <button
              onClick={handleActivate}
              disabled={activating}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
            >
              {activating ? 'Activating...' : 'Activate Paper Trading'}
            </button>
          </div>
        ) : (
          <>
            {status?.error && (
              <div className="bg-gray-900 rounded-xl p-6 text-yellow-400 text-sm">
                {status.error}
              </div>
            )}

            {!status?.error && (
              <>
                {/* Position banner */}
                <div className={`rounded-xl p-4 flex items-center justify-between ${status.current_position === 'IN' ? 'bg-green-900/30 border border-green-800' : 'bg-gray-900'}`}>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Current Position</p>
                    <p className={`text-2xl font-bold ${status.current_position === 'IN' ? 'text-green-400' : 'text-gray-400'}`}>
                      {status.current_position === 'IN' ? 'IN MARKET' : 'OUT / CASH'}
                    </p>
                    {status.current_position === 'IN' && (
                      <p className="text-sm text-gray-400 mt-0.5">
                        Bought at ${status.last_buy_price} · Now ${status.current_price} ·{' '}
                        <span className={status.unrealized_pct >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {status.unrealized_pct >= 0 ? '+' : ''}{fmt(status.unrealized_pct)}% unrealized
                        </span>
                      </p>
                    )}
                  </div>
                  <p className="text-gray-500 text-xs text-right">
                    {status.days_active} trading days<br />since {pt?.started_at}
                  </p>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Total Return', value: `${status.total_return_pct >= 0 ? '+' : ''}${fmt(status.total_return_pct)}%`, color: status.total_return_pct >= 0 ? 'text-green-400' : 'text-red-400' },
                    { label: 'Final Balance', value: `$${status.final_balance.toLocaleString()}` },
                    { label: 'Sharpe Ratio', value: fmt(status.sharpe_ratio, 3) },
                    { label: 'Max Drawdown', value: `${fmt(status.max_drawdown_pct)}%`, color: 'text-red-400' },
                    { label: 'Win Rate', value: `${fmt(status.win_rate)}%`, sub: `${status.num_trades} trade${status.num_trades !== 1 ? 's' : ''}` },
                    { label: 'Current Price', value: `$${status.current_price}` },
                  ].map(({ label, value, color, sub }) => (
                    <div key={label} className="bg-gray-900 rounded-xl p-4">
                      <p className="text-gray-500 text-xs mb-1">{label}</p>
                      <p className={`text-xl font-bold ${color ?? 'text-white'}`}>{value}</p>
                      {sub && <p className="text-gray-600 text-xs mt-0.5">{sub}</p>}
                    </div>
                  ))}
                </div>

                {/* Equity curve */}
                {chartData.length > 1 && (
                  <div className="bg-gray-900 rounded-xl p-6">
                    <h2 className="font-semibold mb-4">Equity Curve</h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} width={55} />
                        <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} formatter={(v: number) => [`$${v.toLocaleString()}`, 'Portfolio']} />
                        <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Recent trades */}
                {status.recent_trades.length > 0 && (
                  <div className="bg-gray-900 rounded-xl p-6">
                    <h2 className="font-semibold mb-4">Recent Trades</h2>
                    <div className="space-y-2">
                      {status.recent_trades.slice().reverse().map((t, i) => (
                        <div key={i} className="flex items-center justify-between text-sm border-b border-gray-800/50 pb-2">
                          <span className="font-mono text-xs text-gray-500">{t.date}</span>
                          <span className={`font-medium ${t.action.startsWith('BUY') ? 'text-green-400' : 'text-red-400'}`}>{t.action}</span>
                          <span className="text-gray-400">${t.price} × {t.shares}</span>
                          {t.pnl !== undefined && (
                            <span className={t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                              {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Event Timeline */}
                {status.events.length > 0 && (
                  <div className="bg-gray-900 rounded-xl p-6">
                    <button
                      onClick={() => setShowEvents((v) => !v)}
                      className="flex items-center gap-2 font-semibold text-sm w-full text-left"
                    >
                      <span>Event Timeline</span>
                      <span className="text-gray-500">({status.events.length} event{status.events.length !== 1 ? 's' : ''})</span>
                      <span className="ml-auto text-gray-500">{showEvents ? '▲' : '▼'}</span>
                    </button>
                    {showEvents && (
                      <div className="mt-4 space-y-2.5 max-h-96 overflow-y-auto">
                        {status.events.slice().reverse().map((e, i) => {
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

            {/* Health Check */}
            <div className="bg-gray-900 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold">Strategy Health Check</h2>
                  <p className="text-gray-500 text-xs mt-0.5">AI analysis of your strategy's current health</p>
                </div>
                <button
                  onClick={handleHealthCheck}
                  disabled={checkingHealth || !!status?.error}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {checkingHealth ? 'Analyzing...' : pt?.health_score ? 'Re-run Check' : 'Run Health Check'}
                </button>
              </div>

              {pt?.health_score ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <ScoreBadge score={pt.health_score} />
                    <div>
                      <p className="text-sm text-gray-400">Health Score</p>
                      <p className="text-xs text-gray-600">
                        {pt.health_score >= 7 ? 'Good' : pt.health_score >= 4 ? 'Fair' : 'Poor'} · checked {pt.health_checked_at?.slice(0, 10)}
                      </p>
                    </div>
                  </div>
                  {healthSections && (
                    <div className="space-y-3 text-sm text-gray-300">
                      {healthSections['VERDICT'] && (
                        <p className="text-gray-200">{healthSections['VERDICT']}</p>
                      )}
                      {['STRENGTHS', 'CONCERNS', 'SUGGESTIONS'].map((section) =>
                        healthSections[section] ? (
                          <div key={section}>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{section}</p>
                            <div className="text-gray-400 text-sm whitespace-pre-line">{healthSections[section]}</div>
                          </div>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-600 text-sm">No health check run yet.</p>
              )}
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            {/* Stop */}
            <div className="flex justify-end">
              <button
                onClick={handleStop}
                disabled={stopping}
                className="text-sm text-gray-600 hover:text-red-400 transition-colors"
              >
                {stopping ? 'Stopping...' : 'Stop Paper Trading'}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
