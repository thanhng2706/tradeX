import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { brokerApi, BrokerStatus, BrokerOverview, BrokerClosePositionsResponse } from '../api/broker'

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-900/40 text-green-400 border border-green-800/60',
  stopped: 'bg-gray-800 text-gray-400 border border-gray-700/60',
  error: 'bg-red-900/40 text-red-400 border border-red-800/60',
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

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-white mb-1">Broker Connection</h1>
      <p className="text-gray-500 text-sm mb-8">
        Connect an Alpaca paper-trading account to eventually run strategies against real order execution.
      </p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : status?.connected ? (
        <>
        <div className="bg-gray-900 border border-gray-800/60 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xs bg-green-900/40 text-green-400 border border-green-800/60 px-2.5 py-1 rounded-full font-medium">
              {status.is_paper ? 'PAPER' : 'LIVE'} · Connected
            </span>
            <span className="text-gray-500 text-xs font-mono">{status.alpaca_account_number}</span>
          </div>
          {!status.credentials_valid && (
            <div className="bg-yellow-950/30 border border-yellow-900/50 rounded-lg px-4 py-3 text-yellow-300 text-xs">
              Alpaca rejected these stored credentials — they may have been rotated or revoked on Alpaca's side.
              Use "Update Credentials" below with a fresh API key/secret.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800/50 rounded-lg p-4">
              <p className="text-gray-500 text-xs mb-1">Buying Power</p>
              <p className="text-xl font-bold text-white">
                {status.buying_power != null ? `$${status.buying_power.toLocaleString()}` : '—'}
              </p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <p className="text-gray-500 text-xs mb-1">Cash</p>
              <p className="text-xl font-bold text-white">
                {status.cash != null ? `$${status.cash.toLocaleString()}` : '—'}
              </p>
            </div>
          </div>
          {status.total_exposure_pct != null && (
            <p className="text-gray-500 text-xs">
              Exposure: ${status.total_exposure_usd!.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({status.total_exposure_pct.toFixed(1)}% of equity, max {status.max_total_exposure_pct?.toFixed(0)}%)
            </p>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {updating ? (
            <div className="space-y-4 pt-2 border-t border-gray-800/60">
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
            <div className="flex items-center gap-3">
              <button
                onClick={() => setUpdating(true)}
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium px-4 py-2 rounded-lg transition-colors text-sm"
              >
                Update Credentials
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="bg-gray-800 hover:bg-red-950/50 disabled:opacity-50 text-gray-300 hover:text-red-400 font-medium px-4 py-2 rounded-lg transition-colors text-sm"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800/60 rounded-xl p-6 mt-6 space-y-4">
          <h2 className="font-semibold">Emergency Controls</h2>
          {status.kill_switch_active ? (
            <div className="bg-yellow-950/30 border border-yellow-900/50 rounded-lg px-4 py-3 space-y-3">
              <p className="text-yellow-300 text-xs">
                Trading paused since {status.kill_switch_activated_at ? new Date(status.kill_switch_activated_at).toLocaleString() : ''} —
                no new orders will be placed by any deployment until resumed.
              </p>
              <button
                onClick={handleToggleKillSwitch}
                disabled={killSwitchBusy}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
              >
                {killSwitchBusy ? 'Resuming...' : 'Resume Trading'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleToggleKillSwitch}
              disabled={killSwitchBusy}
              className="bg-gray-800 hover:bg-red-950/50 disabled:opacity-50 text-gray-300 hover:text-red-400 font-medium px-4 py-2 rounded-lg transition-colors text-sm"
            >
              {killSwitchBusy ? 'Pausing...' : 'Pause All Trading'}
            </button>
          )}

          <div className="pt-2 border-t border-gray-800/60">
            <button
              onClick={() => setShowCloseAllModal(true)}
              className="bg-red-950/40 border border-red-900/50 hover:bg-red-900/60 text-red-400 font-medium px-4 py-2 rounded-lg transition-colors text-sm"
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

        {showCloseAllModal && (
          <CloseAllPositionsModal onClose={() => setShowCloseAllModal(false)} onConfirm={handleCloseAll} />
        )}
        </>
      ) : (
        <div className="bg-gray-900 border border-gray-800/60 rounded-xl p-6 space-y-4">
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
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg transition-colors text-sm"
          >
            {connecting ? 'Connecting...' : 'Connect Alpaca (Paper)'}
          </button>
        </div>
      )}

      {status?.connected && overview && overview.deployments.length > 0 && (
        <div className="mt-10">
          <div className="bg-gray-900 border border-gray-800/60 rounded-xl p-6">
            <h2 className="font-semibold mb-4">Deployments ({overview.deployments.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-800">
                    <th className="text-left pb-2">Strategy</th>
                    <th className="text-left pb-2">Ticker</th>
                    <th className="text-left pb-2">Status</th>
                    <th className="text-left pb-2">Started</th>
                    <th className="text-left pb-2">Last Tick</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.deployments.map((d) => (
                    <tr key={d.id} className="border-b border-gray-800/50 text-gray-400">
                      <td className="py-2">
                        <Link
                          to={`/portfolios/${d.portfolio_id}/strategies/${d.strategy_id}/broker-deploy`}
                          className="text-white hover:text-blue-400 transition-colors"
                        >
                          {d.strategy_name}
                        </Link>
                      </td>
                      <td className="py-2 font-mono text-xs">{d.ticker}</td>
                      <td className="py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[d.status]}`}>
                          {d.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 font-mono text-xs">{d.started_at}</td>
                      <td className="py-2 text-xs">{d.last_tick_at ? new Date(d.last_tick_at).toLocaleString() : 'never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {overview && overview.orders.length > 0 && (
        <div className="mt-6">
          <div className="bg-gray-900 border border-gray-800/60 rounded-xl p-6">
            <h2 className="font-semibold mb-4">Recent Orders ({overview.orders.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-800">
                    <th className="text-left pb-2">Date</th>
                    <th className="text-left pb-2">Strategy</th>
                    <th className="text-left pb-2">Side</th>
                    <th className="text-right pb-2">Qty</th>
                    <th className="text-left pb-2">Status</th>
                    <th className="text-right pb-2">Filled</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.orders.map((o) => (
                    <tr key={o.id} className="border-b border-gray-800/50 text-gray-400">
                      <td className="py-2 font-mono text-xs">{o.trade_date}</td>
                      <td className="py-2 text-white">{o.strategy_name} <span className="text-gray-500 font-mono text-xs">{o.ticker}</span></td>
                      <td className={`py-2 font-medium ${o.side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{o.side}</td>
                      <td className="py-2 text-right">{o.qty.toFixed(4)}</td>
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
          </div>
        </div>
      )}
    </div>
  )
}
