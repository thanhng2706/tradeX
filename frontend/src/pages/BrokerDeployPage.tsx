import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { brokerDeployApi, BrokerDeployment } from '../api/broker_deploy'
import { strategiesApi, Strategy } from '../api/strategies'

const EVENT_META: Record<string, { label: string; color: string; dot: string }> = {
  BUY_SIGNAL: { label: 'Buy Signal', color: 'text-blue-400', dot: 'bg-blue-400' },
  SELL_SIGNAL: { label: 'Sell Signal', color: 'text-purple-400', dot: 'bg-purple-400' },
  SIGNAL_SUPPRESSED: { label: 'Signal Suppressed', color: 'text-yellow-500', dot: 'bg-yellow-500' },
  ORDER_SUBMITTED: { label: 'Order Submitted', color: 'text-green-400', dot: 'bg-green-400' },
  ORDER_FILLED: { label: 'Order Filled', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  ORDER_REJECTED: { label: 'Order Rejected', color: 'text-red-400', dot: 'bg-red-400' },
  DEPLOYMENT_PAUSED: { label: 'Deployment Paused', color: 'text-red-400', dot: 'bg-red-400' },
  ORDER_BLOCKED_CAP: { label: 'Order Blocked (Guardrail)', color: 'text-amber-400', dot: 'bg-amber-400' },
  POSITION_CLOSED: { label: 'Position Closed', color: 'text-orange-400', dot: 'bg-orange-400' },
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-900/40 text-green-400 border border-green-800/60',
  stopped: 'bg-gray-800 text-gray-400 border border-gray-700/60',
  error: 'bg-red-900/40 text-red-400 border border-red-800/60',
}

export default function BrokerDeployPage() {
  const { portfolioId, strategyId } = useParams<{ portfolioId: string; strategyId: string }>()
  const navigate = useNavigate()

  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [deployment, setDeployment] = useState<BrokerDeployment | null>(null)
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
    <div className="max-w-4xl mx-auto px-6 py-8">
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
        {deployment && (
          <span className={`text-xs px-2.5 py-1 rounded-full ${STATUS_BADGE[deployment.status]}`}>
            {deployment.status.toUpperCase()}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : !deployment ? (
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <h2 className="text-lg font-semibold mb-2">Not Deployed to Alpaca</h2>
          <p className="text-gray-500 text-sm mb-6">
            Deploying runs this strategy against your connected Alpaca paper account — real (simulated-money) orders,
            placed automatically once a day.{' '}
            <Link to="/broker" className="text-blue-400 hover:underline">Connect Alpaca first</Link> if you haven't.
          </p>
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            {deploying ? 'Deploying...' : 'Deploy to Alpaca (Paper)'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {deployment.status === 'error' && deployment.last_error && (
            <div className="bg-red-950/30 border border-red-900/50 rounded-lg px-4 py-3 text-red-300 text-sm">
              {deployment.last_error}
            </div>
          )}

          <div className="bg-gray-900 rounded-xl p-6 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Deployed Since</p>
              <p className="text-lg font-semibold text-white">{deployment.started_at}</p>
              <p className="text-xs text-gray-600 mt-1">
                Last tick: {deployment.last_tick_at ? new Date(deployment.last_tick_at).toLocaleString() : 'never'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isActive ? (
                <button
                  onClick={handleRunNow}
                  disabled={runningNow}
                  className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors font-medium"
                >
                  {runningNow ? 'Running...' : 'Run Now'}
                </button>
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

          {/* Event timeline */}
          <div className="bg-gray-900 rounded-xl p-6">
            <h2 className="font-semibold mb-4">Event Timeline ({deployment.events.length})</h2>
            {deployment.events.length === 0 ? (
              <p className="text-gray-600 text-sm">No events yet — runs once a day after market close, or click Run Now.</p>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto">
                {deployment.events.slice().reverse().map((e) => {
                  const meta = EVENT_META[e.type] ?? { label: e.type, color: 'text-gray-400', dot: 'bg-gray-500' }
                  return (
                    <div key={e.id} className="flex items-start gap-3 text-sm">
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

          {isActive && (
            <div className="flex justify-end">
              <button
                onClick={handleStop}
                disabled={stopping}
                className="text-sm text-gray-600 hover:text-red-400 transition-colors"
              >
                {stopping ? 'Stopping...' : 'Stop Deployment'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
