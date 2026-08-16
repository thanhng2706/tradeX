import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import {
  AreaChart, Area, ReferenceDot, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { brokerDeployApi, BrokerDeployment } from '../api/broker_deploy'
import { strategiesApi, Strategy } from '../api/strategies'
import { liveApi, LiveStatus, LiveChatMessage } from '../api/live'
import EventTimeline from '../components/ui/EventTimeline'
import Badge from '../components/ui/Badge'

const STATUS_TONE: Record<string, 'green' | 'neutral' | 'red'> = {
  active: 'green',
  stopped: 'neutral',
  error: 'red',
}

const POLL_MS = 60000

function fmtIndicator(ind: string, params: Record<string, number>): string {
  if (!ind) return ''
  const vals = Object.values(params ?? {})
  return vals.length > 0 ? `${ind}(${vals.join(',')})` : ind
}

function conditionPreview(conditions: any): string {
  const rules = conditions?.rules ?? []
  if (rules.length === 0) return 'No conditions'
  return rules.map((r: any) => {
    const left = fmtIndicator(r.indicator, r.params)
    const right = r.right_indicator
      ? fmtIndicator(r.right_indicator, r.right_params ?? {})
      : typeof r.value === 'number'
        ? (Number.isInteger(r.value) ? String(r.value) : r.value.toFixed(2))
        : ''
    return `${left} ${r.operator} ${right}`
  }).join(` ${conditions.logic} `)
}

// ── Price chart with real buy/sell markers ────────────────────────────────────
function PriceChart({ live }: { live: LiveStatus }) {
  const data = live.price_series
  if (data.length < 2) {
    return <div className="h-64 flex items-center justify-center text-gray-600 text-sm">Not enough price history yet</div>
  }
  const closes = data.map((d) => d.close)
  const minP = Math.min(...closes)
  const maxP = Math.max(...closes)
  const pad = (maxP - minP) * 0.08 || 1
  const positive = closes[closes.length - 1] >= closes[0]
  const color = positive ? '#10b981' : '#ef4444'
  const gradientId = `terminal-grad-${live.strategy_id}`
  const priceDates = new Set(data.map((d) => d.date))
  const markers = live.orders.filter(
    (o) => o.status === 'filled' && o.filled_avg_price != null && priceDates.has(o.trade_date)
  )

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
        <YAxis domain={[minP - pad, maxP + pad]} tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(0)}`} width={55} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#9ca3af', fontSize: 11 }}
          formatter={(v: number) => [`$${v.toFixed(2)}`, 'Close']}
        />
        <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} />
        {markers.map((o) => (
          <ReferenceDot
            key={o.id}
            x={o.trade_date}
            y={o.filled_avg_price as number}
            r={5}
            fill={o.side === 'BUY' ? '#10b981' : '#ef4444'}
            stroke="#0b0f1a"
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

function PositionCard({ live }: { live: LiveStatus }) {
  const p = live.position
  return (
    <div className="bg-gray-950/40 border border-gray-800/60 rounded-lg p-4">
      <p className="text-gray-600 text-[10px] font-semibold tracking-wide uppercase mb-2">Position</p>
      {p.in_position ? (
        <>
          <p className="text-white font-bold">{p.qty?.toFixed(4)} sh @ ${p.avg_entry_price?.toFixed(2)}</p>
          <p className={`text-sm font-medium ${(p.unrealized_pl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {(p.unrealized_pl ?? 0) >= 0 ? '+' : ''}${p.unrealized_pl?.toFixed(2)} unrealized
          </p>
        </>
      ) : (
        <p className="text-gray-500 text-sm">Out of the market — no open position</p>
      )}
    </div>
  )
}

function RuleList({ title, rules }: { title: string; rules: LiveStatus['buy_rules'] }) {
  if (rules.length === 0) return null
  return (
    <div>
      <p className="text-gray-600 text-[10px] font-semibold tracking-wide uppercase mb-2">{title}</p>
      <div className="space-y-1.5">
        {rules.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-xs bg-gray-950/40 border border-gray-800/60 rounded-lg px-3 py-2">
            <span className="font-mono text-gray-400">
              {r.indicator}{r.params && Object.values(r.params).length > 0 ? `(${Object.values(r.params).join(',')})` : ''}
              {' '}= <span className="text-white">{r.left_value != null ? r.left_value.toFixed(2) : '—'}</span>
              {' '}{r.operator}{' '}
              {r.right_indicator ?? 'value'} <span className="text-white">{r.right_value != null ? r.right_value.toFixed(2) : '—'}</span>
            </span>
            <span className={`font-semibold shrink-0 ml-2 ${r.passed ? 'text-emerald-400' : 'text-gray-600'}`}>
              {r.passed ? 'MET' : 'not met'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Chat sidebar — narrates only, no tools, no actions ────────────────────────
function ChatSidebar({ strategyId }: { strategyId: number }) {
  const [messages, setMessages] = useState<LiveChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const sessionRef = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    const mySession = ++sessionRef.current
    const history = messages
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setLoading(true)
    try {
      const res = await liveApi.chat(strategyId, text, history)
      if (sessionRef.current !== mySession) return
      setMessages((prev) => [...prev, { role: 'assistant', content: res.message }])
    } catch {
      if (sessionRef.current !== mySession) return
      setMessages((prev) => [...prev, { role: 'assistant', content: "Sorry, I couldn't reach the live context right now." }])
    } finally {
      if (sessionRef.current === mySession) setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800/60 rounded-xl flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800/60">
        <p className="font-semibold text-sm">Ask about this strategy</p>
        <p className="text-gray-600 text-xs mt-0.5">Narrates real live state — never places trades</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-gray-600 text-xs">Try "why hasn't it bought yet?" or "what's my exposure?"</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
              m.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-800 text-gray-100 rounded-bl-sm'
            }`}>
              {m.role === 'user' ? (
                <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
              ) : (
                <ReactMarkdown components={{
                  p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                }}>
                  {m.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        {loading && <p className="text-gray-600 text-xs">thinking…</p>}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-gray-800/60 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          placeholder="Ask a question..."
          className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors shrink-0"
        >
          Send
        </button>
      </div>
    </div>
  )
}

export default function BrokerDeployPage() {
  const { portfolioId, strategyId } = useParams<{ portfolioId: string; strategyId: string }>()
  const navigate = useNavigate()

  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [deployment, setDeployment] = useState<BrokerDeployment | null>(null)
  const [live, setLive] = useState<LiveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [deploying, setDeploying] = useState(false)
  const [runningNow, setRunningNow] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const list = await strategiesApi.list(Number(portfolioId))
      const s = list.find((s) => s.id === Number(strategyId))
      if (s) setStrategy(s)

      try {
        const d = await brokerDeployApi.status(Number(strategyId))
        setDeployment(d)
      } catch {
        // not deployed yet
      }
      setLoading(false)
    }
    load()
  }, [portfolioId, strategyId])

  // Live chart/position/rule data — only once a deployment exists, polled to stay fresh.
  useEffect(() => {
    if (!deployment) return
    let cancelled = false
    async function poll() {
      try {
        const s = await liveApi.status(Number(strategyId))
        if (!cancelled) setLive(s)
      } catch {
        // strategy has no price history yet, or a transient error — leave last-known live state
      }
    }
    poll()
    const interval = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [deployment?.id, strategyId])

  async function handleDeploy() {
    setDeploying(true)
    setError('')
    try {
      const d = await brokerDeployApi.deploy(Number(strategyId))
      setDeployment(d)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to deploy')
    } finally {
      setDeploying(false)
    }
  }

  async function handleRunNow() {
    setRunningNow(true)
    setError('')
    try {
      const d = await brokerDeployApi.runNow(Number(strategyId))
      setDeployment(d)
      liveApi.status(Number(strategyId)).then(setLive).catch(() => {})
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Tick failed')
    } finally {
      setRunningNow(false)
    }
  }

  async function handleStop() {
    setStopping(true)
    try {
      const d = await brokerDeployApi.undeploy(Number(strategyId))
      setDeployment(d)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to stop')
    } finally {
      setStopping(false)
    }
  }

  const isActive = deployment?.status === 'active'

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <button onClick={() => navigate(`/portfolios/${portfolioId}`)} className="hover:text-gray-300 transition-colors">
          ← {strategy?.name ?? 'Strategy'}
        </button>
        <span className="text-gray-700">/</span>
        <span className="text-gray-300">Alpaca Deployment</span>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-bold">{strategy?.name ?? '...'}</h1>
        <span className="text-xs bg-gray-800 border border-gray-700/60 text-gray-400 px-2 py-1 rounded font-mono">{strategy?.ticker}</span>
        {deployment && <Badge tone={STATUS_TONE[deployment.status]}>{deployment.status.toUpperCase()}</Badge>}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : !deployment ? (
        <div
          className="max-w-2xl mx-auto rounded-2xl border border-gray-800/60 overflow-hidden"
          style={{ background: 'linear-gradient(160deg, rgba(37,99,235,0.10) 0%, rgba(17,24,39,0.5) 50%, rgba(3,7,18,0.7) 100%)' }}
        >
          <div className="px-8 py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-800/40 flex items-center justify-center mx-auto mb-5">
              <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 7h7v7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-xl font-bold mb-2">Not Deployed to Alpaca</h2>
            <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
              Deploying runs this strategy against your connected Alpaca paper account — real (simulated-money) orders,
              placed automatically once a day, with the live chart, position tracker, and chat assistant below.{' '}
              <Link to="/broker" className="text-blue-400 hover:underline">Connect Alpaca first</Link> if you haven't.
            </p>

            {strategy && (
              <div className="bg-gray-950/50 border border-gray-800/60 rounded-lg p-4 text-left mb-6 space-y-1">
                <p className="text-xs text-gray-600 font-mono truncate">
                  <span className="text-green-500 mr-1.5">BUY</span>
                  {conditionPreview(strategy.buy_conditions)}
                </p>
                <p className="text-xs text-gray-600 font-mono truncate">
                  <span className="text-red-500 mr-1.5">SELL</span>
                  {conditionPreview(strategy.sell_conditions)}
                </p>
              </div>
            )}

            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <button
              onClick={handleDeploy}
              disabled={deploying}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg transition-colors shadow-lg shadow-blue-900/30"
            >
              {deploying ? 'Deploying...' : 'Deploy to Alpaca (Paper)'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {deployment.status === 'error' && deployment.last_error && (
            <div className="bg-red-950/30 border border-red-900/50 rounded-lg px-4 py-3 text-red-300 text-sm">
              {deployment.last_error}
            </div>
          )}

          <div className="bg-gray-900 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Deployed Since</p>
              <p className="text-lg font-semibold text-white">{deployment.started_at}</p>
              <p className="text-xs text-gray-600 mt-1">
                Last tick: {deployment.last_tick_at ? new Date(deployment.last_tick_at).toLocaleString() : 'never'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isActive ? (
                <>
                  <button
                    onClick={handleStop}
                    disabled={stopping}
                    className="text-sm bg-red-950/40 hover:bg-red-950/70 border border-red-900/60 text-red-400 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors font-medium"
                  >
                    {stopping ? 'Stopping...' : 'Stop Deployment'}
                  </button>
                  <button
                    onClick={handleRunNow}
                    disabled={runningNow}
                    className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors font-medium"
                  >
                    {runningNow ? 'Running...' : 'Run Now'}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleDeploy}
                  disabled={deploying}
                  className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors font-medium"
                >
                  {deploying ? 'Redeploying...' : deployment.status === 'error' ? 'Redeploy' : 'Resume Deployment'}
                </button>
              )}
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
            <div className="space-y-6 min-w-0">
              {/* Live chart + position + rule breakdown */}
              <div className="bg-gray-900 rounded-xl p-6 space-y-5">
                <h2 className="font-semibold">Live Chart</h2>
                {live ? (
                  <>
                    <PriceChart live={live} />
                    <div className="grid sm:grid-cols-2 gap-4">
                      <PositionCard live={live} />
                      <div className="bg-gray-950/40 border border-gray-800/60 rounded-lg p-4">
                        <p className="text-gray-600 text-[10px] font-semibold tracking-wide uppercase mb-2">As Of</p>
                        <p className="text-white text-sm">{live.as_of_date}</p>
                        <p className="text-gray-600 text-xs mt-1">Refreshes every 60s during market hours</p>
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <RuleList title="Buy Conditions" rules={live.buy_rules} />
                      <RuleList title="Sell Conditions" rules={live.sell_rules} />
                    </div>
                  </>
                ) : (
                  <p className="text-gray-600 text-sm">Loading live data...</p>
                )}
              </div>

              {/* Order history */}
              <div className="bg-gray-900 rounded-xl p-6">
                <h2 className="font-semibold mb-4">Order History ({deployment.orders.length})</h2>
                {deployment.orders.length === 0 ? (
                  <p className="text-gray-600 text-sm">No real orders placed yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 text-xs border-b border-gray-800">
                          <th className="text-left pb-2">Date</th>
                          <th className="text-left pb-2">Side</th>
                          {strategy?.asset_type === 'option' && <th className="text-left pb-2">Contract</th>}
                          <th className="text-right pb-2">Qty</th>
                          <th className="text-left pb-2">Status</th>
                          <th className="text-right pb-2">Filled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deployment.orders.slice().reverse().map((o) => (
                          <tr key={o.id} className="border-b border-gray-800/50 text-gray-400">
                            <td className="py-2 font-mono text-xs">{o.trade_date}</td>
                            <td className={`py-2 font-medium ${o.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{o.side}</td>
                            {strategy?.asset_type === 'option' && (
                              <td className="py-2 font-mono text-xs">
                                {o.option_type} ${o.strike} · {o.expiration}
                              </td>
                            )}
                            <td className="py-2 text-right">{strategy?.asset_type === 'option' ? o.qty : o.qty.toFixed(4)}</td>
                            <td className="py-2">
                              <span className={o.status === 'filled' ? 'text-emerald-400' : o.status === 'rejected' || o.status === 'canceled' ? 'text-red-400' : 'text-gray-400'}>
                                {o.status ?? '—'}
                              </span>
                            </td>
                            <td className="py-2 text-right font-mono text-xs">
                              {o.filled_avg_price != null ? `${o.filled_qty?.toFixed(4)} @ $${o.filled_avg_price.toFixed(2)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {deployment.events.length === 0 ? (
                <div className="bg-gray-900 rounded-xl p-6">
                  <h2 className="font-semibold mb-2">Event Timeline</h2>
                  <p className="text-gray-600 text-sm">No events yet — runs once a day after market close, or click Run Now.</p>
                </div>
              ) : (
                <EventTimeline events={deployment.events} />
              )}
            </div>

            <div className="h-[600px] lg:h-[720px] lg:sticky lg:top-6">
              <ChatSidebar strategyId={Number(strategyId)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
