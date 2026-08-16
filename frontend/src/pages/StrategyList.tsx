import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { strategiesApi, Strategy } from '../api/strategies'
import { performanceApi, PerformanceSummary } from '../api/performance'
import api from '../api/client'
import Badge from '../components/ui/Badge'
import MiniEquityChart from '../components/ui/MiniEquityChart'
import { fmtUsd, fmtPct } from '../utils/format'

interface Portfolio {
  id: number
  name: string
  starting_balance: number
}

function DropdownMenu({ items }: {
  items: { label: string; onClick: () => void; danger?: boolean }[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition-all text-lg leading-none"
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700/60 rounded-xl shadow-2xl z-20 min-w-[160px] py-1.5 overflow-hidden">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); setOpen(false) }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                item.danger
                  ? 'text-red-400 hover:bg-red-950/40'
                  : 'text-gray-300 hover:bg-gray-700/60'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function fmtIndicator(ind: string, params: Record<string, number>): string {
  if (!ind) return ''
  const vals = Object.values(params ?? {})
  return vals.length > 0 ? `${ind}(${vals.join(',')})` : ind
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-gray-600 text-[10px] font-semibold tracking-wide uppercase mb-1">{label}</p>
      <p className={`text-sm font-bold ${color ?? 'text-white'}`}>{value}</p>
    </div>
  )
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

export default function StrategyList() {
  const { portfolioId } = useParams<{ portfolioId: string }>()
  const id = Number(portfolioId)
  const navigate = useNavigate()
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [performance, setPerformance] = useState<PerformanceSummary | null>(null)

  useEffect(() => {
    api.get<Portfolio[]>('/portfolios').then((r) => {
      const p = r.data.find((p) => p.id === id)
      if (p) setPortfolio(p)
    })
    strategiesApi.list(id).then(setStrategies)
    performanceApi.summary().then(setPerformance).catch(() => {})
  }, [id])

  const perfById = new Map((performance?.strategies ?? []).map((s) => [s.strategy_id, s]))
  const portfolioPerf = (performance?.strategies ?? []).filter((s) => s.portfolio_id === id)
  const liveInPortfolio = portfolioPerf.filter((s) => s.source === 'live')
  const backtestInPortfolio = portfolioPerf.filter((s) => s.source === 'backtest')
  const livePnlSum = liveInPortfolio.reduce((sum, s) => sum + (s.total_pnl_usd ?? 0), 0)
  const backtestAvgPct = backtestInPortfolio.length
    ? backtestInPortfolio.reduce((sum, s) => sum + (s.total_return_pct ?? 0), 0) / backtestInPortfolio.length
    : null

  async function handleDelete(strategyId: number) {
    if (!confirm('Delete this strategy?')) return
    await strategiesApi.delete(strategyId)
    setStrategies((prev) => prev.filter((s) => s.id !== strategyId))
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-5">
        <Link to="/" className="hover:text-gray-300 transition-colors">Dashboard</Link>
        <span className="text-gray-700">/</span>
        <span className="text-gray-300">{portfolio?.name ?? '...'}</span>
      </div>

      {/* Hero: identity + actions + performance, one cohesive panel */}
      <div
        className="relative overflow-hidden rounded-2xl border border-gray-800/60 mb-8"
        style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.10) 0%, rgba(17,24,39,0.4) 45%, rgba(3,7,18,0.6) 100%)' }}
      >
        <div className="px-6 sm:px-8 py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white text-lg font-black shrink-0 shadow-lg shadow-blue-900/30">
                {(portfolio?.name ?? '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-white truncate">{portfolio?.name ?? '...'}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate(`/library?portfolio=${id}`)}
                className="border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                Browse Library
              </button>
              <button
                onClick={() => navigate(`/portfolios/${id}/strategies/new`)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                + New Strategy
              </button>
            </div>
          </div>

          {/* Performance summary — real vs backtested, never blended */}
          {performance && strategies.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-10 gap-y-4 mt-7 pt-6 border-t border-gray-800/60">
              <div>
                <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-1.5 flex items-center gap-1.5">
                  <svg className="w-3 h-3 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4" /></svg>
                  Starting Capital
                </p>
                <p className="text-3xl font-black text-white">${portfolio?.starting_balance.toLocaleString() ?? '—'}</p>
                <p className="text-gray-600 text-xs mt-0.5">per-strategy simulated balance</p>
              </div>

              <div className="h-12 w-px bg-gray-800 hidden sm:block" />

              <div>
                <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-1.5 flex items-center gap-1.5">
                  <svg className="w-3 h-3 text-emerald-500" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4" /></svg>
                  Live P&amp;L
                </p>
                {liveInPortfolio.length > 0 ? (
                  <>
                    <p className={`text-3xl font-black ${livePnlSum >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtUsd(livePnlSum)}</p>
                    <p className="text-gray-600 text-xs mt-0.5">{liveInPortfolio.length} real strateg{liveInPortfolio.length !== 1 ? 'ies' : 'y'} deployed</p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-black text-gray-700">—</p>
                    <p className="text-gray-600 text-xs mt-0.5">No real trades yet</p>
                  </>
                )}
              </div>

              <div className="h-12 w-px bg-gray-800 hidden sm:block" />

              <div>
                <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-1.5 flex items-center gap-1.5">
                  <svg className="w-3 h-3 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4" /></svg>
                  Backtested Avg Return
                </p>
                {backtestAvgPct != null ? (
                  <>
                    <p className={`text-3xl font-black ${backtestAvgPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(backtestAvgPct)}</p>
                    <p className="text-gray-600 text-xs mt-0.5">across {backtestInPortfolio.length} strateg{backtestInPortfolio.length !== 1 ? 'ies' : 'y'} · simulated</p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-black text-gray-700">—</p>
                    <p className="text-gray-600 text-xs mt-0.5">No backtests yet</p>
                  </>
                )}
              </div>

              <div className="h-12 w-px bg-gray-800 hidden sm:block" />

              <div>
                <p className="text-gray-500 text-xs font-semibold tracking-widest uppercase mb-1.5 flex items-center gap-1.5">
                  <svg className="w-3 h-3 text-purple-500" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4" /></svg>
                  Total Strategies
                </p>
                <p className="text-3xl font-black text-white">{strategies.length}</p>
                <p className="text-gray-600 text-xs mt-0.5">
                  {liveInPortfolio.length} live · {backtestInPortfolio.length} backtested
                  {strategies.length - liveInPortfolio.length - backtestInPortfolio.length > 0
                    ? ` · ${strategies.length - liveInPortfolio.length - backtestInPortfolio.length} untested`
                    : ''}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {strategies.length === 0 ? (
        <div className="border border-dashed border-gray-800 rounded-xl py-20 text-center">
          <p className="text-gray-600 text-sm mb-4">No strategies yet</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => navigate(`/library?portfolio=${id}`)}
              className="border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              Browse Library
            </button>
            <button
              onClick={() => navigate(`/portfolios/${id}/strategies/new`)}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              Create your first strategy
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {strategies.map((s) => {
            const perf = perfById.get(s.id)
            const perfValue = perf ? (perf.source === 'live' ? perf.total_pnl_usd : perf.total_return_pct) : null
            const perfPositive = (perfValue ?? 0) >= 0

            const hasPerf = perf && perf.source !== 'none'

            return (
            <div
              key={s.id}
              className="group bg-gray-900 border border-gray-800/60 hover:border-gray-700/80 rounded-xl p-5 transition-all"
            >
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                  <span className="font-semibold text-white">{s.name}</span>
                  <span className="text-xs bg-gray-800 border border-gray-700/60 text-gray-400 px-2 py-0.5 rounded font-mono">
                    {s.ticker}
                  </span>
                  {s.asset_type === 'option' && <Badge tone="purple">OPTION</Badge>}
                  <Badge tone={perf?.source === 'live' ? 'green' : perf?.source === 'backtest' ? 'blue' : 'neutral'}>
                    {perf?.source === 'live' ? 'LIVE' : perf?.source === 'backtest' ? 'BACKTESTED' : 'UNTESTED'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/portfolios/${id}/strategies/${s.id}/backtest`)}
                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    Backtest
                  </button>
                  <button
                    onClick={() => navigate(`/portfolios/${id}/strategies/${s.id}/optimize`)}
                    className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    Optimize
                  </button>
                  <button
                    onClick={() => navigate(`/portfolios/${id}/strategies/${s.id}/paper`)}
                    className="text-xs bg-green-600 hover:bg-green-500 text-white px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    Paper Trade
                  </button>
                  <button
                    onClick={() => navigate(`/portfolios/${id}/strategies/${s.id}/broker-deploy`)}
                    className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    Deploy to Alpaca
                  </button>
                  <DropdownMenu
                    items={[
                      { label: 'Edit', onClick: () => navigate(`/portfolios/${id}/strategies/${s.id}/edit`) },
                      { label: 'Delete', onClick: () => handleDelete(s.id), danger: true },
                    ]}
                  />
                </div>
              </div>

              {s.description && (
                <p className="text-gray-500 text-xs mt-2">{s.description}</p>
              )}

              {/* Conditions */}
              <div className="space-y-1 mt-3 mb-4">
                <p className="text-xs text-gray-600 font-mono truncate">
                  <span className="text-green-500 mr-1.5">BUY</span>
                  {conditionPreview(s.buy_conditions)}
                </p>
                <p className="text-xs text-gray-600 font-mono truncate">
                  <span className="text-red-500 mr-1.5">SELL</span>
                  {conditionPreview(s.sell_conditions)}
                </p>
              </div>

              {/* Full-width equity chart */}
              <div className="mb-4">
                {hasPerf ? (
                  <MiniEquityChart curve={perf!.equity_curve} positive={perfPositive} height={130} showAxis showTooltip />
                ) : (
                  <div className="h-[130px] flex items-center justify-center bg-gray-950/40 border border-dashed border-gray-800 rounded-lg">
                    <div className="text-center">
                      <p className="text-gray-600 text-sm mb-1.5">Never backtested</p>
                      <button
                        onClick={() => navigate(`/portfolios/${id}/strategies/${s.id}/backtest`)}
                        className="text-blue-400 hover:underline text-xs font-medium"
                      >
                        Run a backtest →
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3">
                <Stat
                  label={perf?.source === 'live' ? 'Live P&L' : 'Return'}
                  value={hasPerf ? (perf!.source === 'live' ? fmtUsd(perf!.total_pnl_usd ?? 0) : fmtPct(perf!.total_return_pct ?? 0)) : '—'}
                  color={hasPerf ? (perfPositive ? 'text-emerald-400' : 'text-red-400') : undefined}
                />
                <Stat label="Win Rate" value={perf?.win_rate != null ? `${perf.win_rate.toFixed(0)}%` : '—'} />
                <Stat label="Trades" value={hasPerf ? String(perf!.num_trades) : '—'} />
                <Stat label="Position Size" value={`${s.position_size_pct}%`} />
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
