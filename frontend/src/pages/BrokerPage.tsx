import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { brokerApi, BrokerStatus, BrokerOverview, BrokerClosePositionsResponse } from '../api/broker'
import Badge from '../components/ui/Badge'

const STATUS_TONE: Record<string, 'green' | 'neutral' | 'red'> = {
  active: 'green',
  stopped: 'neutral',
  error: 'red',
}

function CloseAllPositionsModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => Promise<void> }) {
  const [closing, setClosing] = useState(false)

  async function handleConfirm() {
    setClosing(true)
    try {
      await onConfirm()
    } finally { setClosing(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-white font-semibold text-lg mb-2">Close all positions?</h3>
        <p className="text-gray-500 text-sm mb-6">
          This immediately submits a market sell order for every open position on this Alpaca account, regardless
          of what any strategy's conditions say. This can't be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={handleConfirm} disabled={closing}
            className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
            {closing ? 'Closing…' : 'Close All Positions'}
          </button>
          <button onClick={onClose}
            className="px-4 text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-xl transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800/60 rounded-2xl p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 shrink-0">
          {icon}
        </div>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function BrokerPage() {
  const [status, setStatus] = useState<BrokerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState(false)
  const [overview, setOverview] = useState<BrokerOverview | null>(null)
  const [killSwitchBusy, setKillSwitchBusy] = useState(false)
  const [showCloseAllModal, setShowCloseAllModal] = useState(false)
  const [closeAllResult, setCloseAllResult] = useState<BrokerClosePositionsResponse | null>(null)

  const EMPTY_STATUS: BrokerStatus = {
    connected: false, broker: null, is_paper: null, alpaca_account_number: null, buying_power: null, cash: null,
    connected_at: null, credentials_valid: true, kill_switch_active: false, kill_switch_activated_at: null,
    total_exposure_usd: null, total_exposure_pct: null, max_total_exposure_pct: null,
  }

  useEffect(() => {
    brokerApi.status()
      .then(setStatus)
      .catch(() => setStatus(EMPTY_STATUS))
      .finally(() => setLoading(false))
    brokerApi.overview().then(setOverview).catch(() => setOverview({ deployments: [], orders: [] }))
  }, [])

  async function handleConnect() {
    setConnecting(true)
    setError('')
    try {
      const res = await brokerApi.connect(apiKey, apiSecret, true)
      setStatus(res)
      setApiKey('')
      setApiSecret('')
      setUpdating(false)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to connect to Alpaca')
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await brokerApi.disconnect()
      setStatus(EMPTY_STATUS)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleToggleKillSwitch() {
    setKillSwitchBusy(true)
    setError('')
    try {
      const res = status?.kill_switch_active
        ? await brokerApi.deactivateKillSwitch()
        : await brokerApi.activateKillSwitch()
      setStatus(res)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update kill switch')
    } finally {
      setKillSwitchBusy(false)
    }
  }

  async function handleCloseAll() {
    setError('')
    try {
      const res = await brokerApi.closeAllPositions()
      setCloseAllResult(res)
      brokerApi.status().then(setStatus).catch(() => {})
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to close positions')
    } finally {
      setShowCloseAllModal(false)
    }
  }

  const exposurePct = status?.total_exposure_pct ?? 0
  const maxExposurePct = status?.max_total_exposure_pct ?? 75

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-xl bg-blue-600/15 border border-blue-800/40 flex items-center justify-center text-blue-400 shrink-0">
          <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 18, height: 18 }}>
            <rect x="3" y="10" width="4" height="10" rx="1" />
            <rect x="10" y="6" width="4" height="14" rx="1" />
            <rect x="17" y="3" width="4" height="17" rx="1" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white">Broker Connection</h1>
      </div>
      <p className="text-gray-500 text-sm mb-8 ml-12">
        Connect an Alpaca paper-trading account to eventually run strategies against real order execution.
      </p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : status?.connected ? (
        <>
        <div
          className="rounded-2xl border border-gray-800/60 overflow-hidden mb-6"
          style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.10) 0%, rgba(17,24,39,0.4) 45%, rgba(3,7,18,0.6) 100%)' }}
        >
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-2.5">
              <Badge tone="green">{status.is_paper ? 'PAPER' : 'LIVE'} · Connected</Badge>
              <span className="text-gray-500 text-xs font-mono">{status.alpaca_account_number}</span>
            </div>
            {!status.credentials_valid && (
              <div className="bg-yellow-950/30 border border-yellow-900/50 rounded-lg px-4 py-3 text-yellow-300 text-xs">
                Alpaca rejected these stored credentials — they may have been rotated or revoked on Alpaca's side.
                Use "Update Credentials" below with a fresh API key/secret.
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-950/40 border border-gray-800/60 rounded-xl p-4">
                <p className="text-gray-500 text-[10px] font-semibold tracking-wide uppercase mb-1.5">Buying Power</p>
                <p className="text-2xl font-black text-white">
                  {status.buying_power != null ? `$${status.buying_power.toLocaleString()}` : '—'}
                </p>
              </div>
              <div className="bg-gray-950/40 border border-gray-800/60 rounded-xl p-4">
                <p className="text-gray-500 text-[10px] font-semibold tracking-wide uppercase mb-1.5">Cash</p>
                <p className="text-2xl font-black text-white">
                  {status.cash != null ? `$${status.cash.toLocaleString()}` : '—'}
                </p>
              </div>
            </div>
            {status.total_exposure_pct != null && (
              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span>Exposure</span>
                  <span>
                    ${status.total_exposure_usd!.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    {' '}({exposurePct.toFixed(1)}% of equity, max {maxExposurePct.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${exposurePct / maxExposurePct > 0.85 ? 'bg-amber-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(100, (exposurePct / maxExposurePct) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}

            {updating ? (
              <div className="space-y-4 pt-4 border-t border-gray-800/60">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">New API Key ID</label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="PK..."
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">New Secret Key</label>
                  <input
                    type="password"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleConnect}
                    disabled={connecting || !apiKey || !apiSecret}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg transition-colors text-sm"
                  >
                    {connecting ? 'Saving...' : 'Save New Credentials'}
                  </button>
                  <button
                    onClick={() => { setUpdating(false); setApiKey(''); setApiSecret(''); setError('') }}
                    disabled={connecting}
                    className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-medium px-4 py-2 rounded-lg transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => setUpdating(true)}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700/60 text-gray-300 font-medium px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  Update Credentials
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="bg-gray-800 hover:bg-red-950/50 border border-gray-700/60 hover:border-red-900/60 disabled:opacity-50 text-gray-300 hover:text-red-400 font-medium px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            )}
          </div>
        </div>

        <SectionCard
          title="Emergency Controls"
          icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v4M12 17h.01" strokeLinecap="round" /><path d="M10.3 3.8 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" strokeLinejoin="round" /></svg>}
        >
          <div className="grid sm:grid-cols-2 gap-4 items-stretch">
            <div className="bg-gray-950/40 border border-gray-800/60 rounded-xl p-4 flex flex-col">
              <p className="text-gray-500 text-xs mb-3 flex-1">Pause every deployment from placing new orders — existing positions stay open.</p>
              {status.kill_switch_active ? (
                <div className="space-y-3">
                  <p className="text-yellow-300 text-xs bg-yellow-950/30 border border-yellow-900/50 rounded-lg px-3 py-2">
                    Paused since {status.kill_switch_activated_at ? new Date(status.kill_switch_activated_at).toLocaleString() : ''}
                  </p>
                  <button
                    onClick={handleToggleKillSwitch}
                    disabled={killSwitchBusy}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
                  >
                    {killSwitchBusy ? 'Resuming...' : 'Resume Trading'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleToggleKillSwitch}
                  disabled={killSwitchBusy}
                  className="w-full bg-gray-800 hover:bg-red-950/50 border border-gray-700/60 hover:border-red-900/60 disabled:opacity-50 text-gray-300 hover:text-red-400 font-medium px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  {killSwitchBusy ? 'Pausing...' : 'Pause All Trading'}
                </button>
              )}
            </div>

            <div className="bg-gray-950/40 border border-gray-800/60 rounded-xl p-4 flex flex-col">
              <p className="text-gray-500 text-xs mb-3 flex-1">Immediately market-sell every open position on this account. Not reversible.</p>
              <button
                onClick={() => setShowCloseAllModal(true)}
                className="w-full bg-red-950/40 border border-red-900/50 hover:bg-red-900/60 text-red-400 font-medium px-4 py-2 rounded-lg transition-colors text-sm"
              >
                Close All Positions
              </button>
              {closeAllResult && (
                <p className="text-gray-500 text-xs mt-2">
                  Closed {closeAllResult.closed.length} position{closeAllResult.closed.length === 1 ? '' : 's'}
                  {closeAllResult.errors.length > 0 && `, ${closeAllResult.errors.length} error(s): ${closeAllResult.errors.map((e) => `${e.symbol} (${e.error})`).join(', ')}`}
                </p>
              )}
            </div>
          </div>
        </SectionCard>

        {showCloseAllModal && (
          <CloseAllPositionsModal onClose={() => setShowCloseAllModal(false)} onConfirm={handleCloseAll} />
        )}
        </>
      ) : (
        <div className="bg-gray-900 border border-gray-800/60 rounded-2xl p-6 space-y-4">
          <div className="bg-blue-950/30 border border-blue-900/50 rounded-lg px-4 py-3 text-blue-300 text-xs">
            Paper trading only for now — no real money is ever at risk here. Live trading will be enabled once
            safety guardrails (position caps, kill switch) ship.
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">API Key ID</label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="PK..."
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Secret Key</label>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="••••••••••••••••"
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={handleConnect}
            disabled={connecting || !apiKey || !apiSecret}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg transition-colors text-sm shadow-lg shadow-blue-900/30"
          >
            {connecting ? 'Connecting...' : 'Connect Alpaca (Paper)'}
          </button>
        </div>
      )}

      {status?.connected && overview && overview.deployments.length > 0 && (
        <div className="mt-6">
          <SectionCard
            title={`Deployments (${overview.deployments.length})`}
            icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V5m0 14h16M4 19l5-6 4 3 6-8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          >
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-800">
                    <th className="text-left pb-2 px-2">Strategy</th>
                    <th className="text-left pb-2 px-2">Ticker</th>
                    <th className="text-left pb-2 px-2">Status</th>
                    <th className="text-left pb-2 px-2">Started</th>
                    <th className="text-left pb-2 px-2">Last Tick</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.deployments.map((d) => (
                    <tr key={d.id} className="border-b border-gray-800/50 text-gray-400 hover:bg-gray-800/20 transition-colors">
                      <td className="py-2.5 px-2">
                        <Link
                          to={`/portfolios/${d.portfolio_id}/strategies/${d.strategy_id}/broker-deploy`}
                          className="text-white hover:text-blue-400 transition-colors font-medium"
                        >
                          {d.strategy_name}
                        </Link>
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="text-xs bg-gray-800 border border-gray-700/60 text-gray-400 px-2 py-0.5 rounded font-mono">{d.ticker}</span>
                      </td>
                      <td className="py-2.5 px-2">
                        <Badge tone={STATUS_TONE[d.status]}>{d.status.toUpperCase()}</Badge>
                      </td>
                      <td className="py-2.5 px-2 font-mono text-xs">{d.started_at}</td>
                      <td className="py-2.5 px-2 text-xs">{d.last_tick_at ? new Date(d.last_tick_at).toLocaleString() : 'never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}

      {overview && overview.orders.length > 0 && (
        <div className="mt-6">
          <SectionCard
            title={`Recent Orders (${overview.orders.length})`}
            icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h6" strokeLinecap="round" /></svg>}
          >
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-800">
                    <th className="text-left pb-2 px-2">Date</th>
                    <th className="text-left pb-2 px-2">Strategy</th>
                    <th className="text-left pb-2 px-2">Side</th>
                    <th className="text-right pb-2 px-2">Qty</th>
                    <th className="text-left pb-2 px-2">Status</th>
                    <th className="text-right pb-2 px-2">Filled</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.orders.map((o) => (
                    <tr key={o.id} className="border-b border-gray-800/50 text-gray-400 hover:bg-gray-800/20 transition-colors">
                      <td className="py-2.5 px-2 font-mono text-xs">{o.trade_date}</td>
                      <td className="py-2.5 px-2 text-white">{o.strategy_name} <span className="text-gray-500 font-mono text-xs">{o.ticker}</span></td>
                      <td className={`py-2.5 px-2 font-medium ${o.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{o.side}</td>
                      <td className="py-2.5 px-2 text-right">{o.qty.toFixed(4)}</td>
                      <td className="py-2.5 px-2">
                        <span className={o.status === 'filled' ? 'text-emerald-400' : o.status === 'rejected' || o.status === 'canceled' ? 'text-red-400' : 'text-gray-400'}>
                          {o.status ?? '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-xs">
                        {o.filled_avg_price != null ? `${o.filled_qty?.toFixed(4)} @ $${o.filled_avg_price.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  )
}
