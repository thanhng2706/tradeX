import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { strategiesApi, Strategy } from '../api/strategies'
import api from '../api/client'

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

  useEffect(() => {
    api.get<Portfolio[]>('/portfolios').then((r) => {
      const p = r.data.find((p) => p.id === id)
      if (p) setPortfolio(p)
    })
    strategiesApi.list(id).then(setStrategies)
  }, [id])

  async function handleDelete(strategyId: number) {
    if (!confirm('Delete this strategy?')) return
    await strategiesApi.delete(strategyId)
    setStrategies((prev) => prev.filter((s) => s.id !== strategyId))
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-8">
        <Link to="/" className="hover:text-gray-300 transition-colors">Dashboard</Link>
        <span className="text-gray-700">/</span>
        <span className="text-gray-300">{portfolio?.name ?? '...'}</span>
      </div>

      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{portfolio?.name ?? '...'}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            ${portfolio?.starting_balance.toLocaleString()} starting capital
          </p>
        </div>
        <button
          onClick={() => navigate(`/portfolios/${id}/strategies/new`)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          + New Strategy
        </button>
      </div>

      {strategies.length === 0 ? (
        <div className="border border-dashed border-gray-800 rounded-xl py-20 text-center">
          <p className="text-gray-600 text-sm mb-4">No strategies yet</p>
          <button
            onClick={() => navigate(`/portfolios/${id}/strategies/new`)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            Create your first strategy
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {strategies.map((s) => (
            <div
              key={s.id}
              className="group bg-gray-900 border border-gray-800/60 hover:border-gray-700/80 rounded-xl p-5 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="font-semibold text-white">{s.name}</span>
                    <span className="text-xs bg-gray-800 border border-gray-700/60 text-gray-400 px-2 py-0.5 rounded font-mono">
                      {s.ticker}
                    </span>
                  </div>
                  {s.description && (
                    <p className="text-gray-500 text-xs mb-2">{s.description}</p>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs text-gray-600 font-mono truncate">
                      <span className="text-green-500 mr-1.5">BUY</span>
                      {conditionPreview(s.buy_conditions)}
                    </p>
                    <p className="text-xs text-gray-600 font-mono truncate">
                      <span className="text-red-500 mr-1.5">SELL</span>
                      {conditionPreview(s.sell_conditions)}
                    </p>
                  </div>
                  <p className="text-xs text-gray-700 mt-2">{s.position_size_pct}% position size</p>
                </div>

                {/* Right: actions */}
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
                  <DropdownMenu
                    items={[
                      { label: 'Edit', onClick: () => navigate(`/portfolios/${id}/strategies/${s.id}/edit`) },
                      { label: 'Delete', onClick: () => handleDelete(s.id), danger: true },
                    ]}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
