import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuthStore } from '../store/authStore'

interface Portfolio {
  id: number
  name: string
  description: string
  starting_balance: number
  created_at: string
}

interface TickerItem {
  symbol: string
  price: number | null
  change: number
  change_pct: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function isMarketOpen(): boolean {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = et.getDay()
  if (day === 0 || day === 6) return false
  const mins = et.getHours() * 60 + et.getMinutes()
  return mins >= 570 && mins < 960 // 9:30–16:00
}

function fmtPrice(p: number | null): string {
  if (p == null) return '—'
  return p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p.toFixed(2)
}

// Deterministic decorative sparkline per portfolio id
function sparkPoints(id: number): { x: number; y: number }[] {
  const base = [0, 4, 2, 7, 5, 9, 6, 11, 8, 14]
  return base.map((y, i) => {
    const jitter = ((id * (i + 3)) % 6) - 3
    return { x: i * 22, y: 32 - y - jitter }
  })
}

function sparkLinePath(pts: { x: number; y: number }[]): string {
  return `M ${pts.map((p) => `${p.x},${p.y}`).join(' L ')}`
}

function sparkAreaPath(pts: { x: number; y: number }[], height: number): string {
  const line = pts.map((p) => `${p.x},${p.y}`).join(' L ')
  const last = pts[pts.length - 1]
  const first = pts[0]
  return `M ${line} L ${last.x},${height} L ${first.x},${height} Z`
}

// ── Ticker Tape ───────────────────────────────────────────────────────────────
function TickerTape({ tickers }: { tickers: TickerItem[] }) {
  if (!tickers.length) return <div className="h-8 bg-gray-900/80 border-b border-gray-800/60" />
  const items = [...tickers, ...tickers] // duplicate for seamless loop

  return (
    <div className="h-8 bg-gray-900/90 border-b border-gray-800/50 overflow-hidden flex items-center select-none">
      <div className="ticker-scroll flex items-center gap-0 whitespace-nowrap">
        {items.map((t, i) => {
          const pos = t.change_pct >= 0
          return (
            <span key={i} className="inline-flex items-center gap-1.5 px-5 text-xs border-r border-gray-800/60">
              <span className="font-bold text-white">{t.symbol}</span>
              <span className="text-gray-300">{fmtPrice(t.price)}</span>
              <span className={pos ? 'text-emerald-400' : 'text-red-400'}>
                {pos ? '+' : ''}{t.change_pct.toFixed(2)}%
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Hawk Eye ──────────────────────────────────────────────────────────────────
// Asymmetric: left corner lower (y=162), right corner higher (y=125)
// Iris bulges PAST the eyelid — drawn unclipped, outline drawn on top
const CX = 205
const CY = 144
const IR = 96 // iris radius — large so it fills and spills past the lid

const EYE_PATH =
  `M 14,${CY + 18} ` +           // left corner — drooped below center
  `C 85,38 295,18 405,${CY - 19} ` + // top arc — steep, peaks left of center
  `C 340,235 88,250 14,${CY + 18} Z` // bottom arc — flatter, returns to left corner

function HawkEye() {
  const spokes = Array.from({ length: 18 }, (_, i) => {
    const a = (i * 20 * Math.PI) / 180
    return { x2: CX + Math.cos(a) * IR, y2: CY + Math.sin(a) * IR }
  })

  return (
    <div className="relative flex items-center justify-center w-full h-full select-none">
      {/* Ambient glow — offset slightly up-left to match eye asymmetry */}
      <div className="absolute"
        style={{
          width: 340, height: 260,
          background: `radial-gradient(ellipse at 48% 52%, rgba(59,130,246,0.18) 0%, transparent 65%)`,
        }} />

      <svg width="430" height="290" viewBox="0 0 430 290" className="relative z-10">
        <defs>
          <radialGradient id="irisGrad" cx="44%" cy="40%" r="60%">
            <stop offset="0%"   stopColor="#1e3a8a" />
            <stop offset="22%"  stopColor="#1e40af" />
            <stop offset="50%"  stopColor="#2563eb" />
            <stop offset="75%"  stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#0c1445" />
          </radialGradient>
          <radialGradient id="outerGlow" cx="48%" cy="52%" r="50%">
            <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0"    />
          </radialGradient>
          <filter id="irisGlow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Outer ambient glow */}
        <ellipse cx={CX} cy={CY} rx="200" ry="130" fill="url(#outerGlow)" />

        {/* Dashed targeting ring — follows the asymmetric center */}
        <ellipse cx={CX} cy={CY} rx="175" ry="112" fill="none"
          stroke="#3b82f6" strokeWidth="0.6" strokeOpacity="0.16" strokeDasharray="7 7" />

        {/* ── Blinking group — contains the ENTIRE eye so it closes naturally ── */}
        <g className="eye-blink">
          {/* Eye dark fill */}
          <path d={EYE_PATH} fill="#030610" />

          {/* Iris — larger than eye opening, NOT clipped */}
          <circle cx={CX} cy={CY} r={IR} fill="url(#irisGrad)"
            className="iris-pulse" filter="url(#irisGlow)" />

          {/* Radial spokes */}
          {spokes.map((s, i) => (
            <line key={i} x1={CX} y1={CY} x2={s.x2} y2={s.y2}
              stroke="#1e3a8a" strokeWidth="0.9" strokeOpacity="0.55" />
          ))}

          {/* Concentric iris rings */}
          <circle cx={CX} cy={CY} r={IR} fill="none" stroke="#3b82f6" strokeWidth="2.8" strokeOpacity="0.72" />
          <circle cx={CX} cy={CY} r={78} fill="none" stroke="#60a5fa" strokeWidth="0.9" strokeOpacity="0.4"  />
          <circle cx={CX} cy={CY} r={60} fill="none" stroke="#93c5fd" strokeWidth="0.6" strokeOpacity="0.25" />
          <circle cx={CX} cy={CY} r={42} fill="none" stroke="#bfdbfe" strokeWidth="0.4" strokeOpacity="0.18" />

          {/* Pupil */}
          <circle cx={CX} cy={CY} r={27} fill="#010205" />

          {/* Highlights */}
          <circle cx={CX + 16} cy={CY - 18} r={10} fill="rgba(255,255,255,0.32)" />
          <circle cx={CX + 24} cy={CY - 8}  r={4}  fill="rgba(255,255,255,0.13)" />

          {/* Eyelid outline — inside blink group so it closes with the rest */}
          <path d={EYE_PATH} fill="none" stroke="#3b82f6" strokeWidth="2.8" strokeOpacity="0.88" />
          <path d={EYE_PATH} fill="none" stroke="#dbeafe" strokeWidth="0.7" strokeOpacity="0.25" />
        </g>

        {/* Crosshairs — angled to match asymmetric corners */}
        <line x1="14"  y1="162" x2="108" y2="150" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.45" />
        <line x1="302" y1="136" x2="405" y2="125" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.45" />
        <line x1={CX}  y1="20"  x2={CX}  y2="116" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.45" />
        <line x1={CX}  y1="172" x2={CX}  y2="268" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.45" />

        {/* Tick marks */}
        <line x1="80"  y1="144" x2="80"  y2="158" stroke="#3b82f6" strokeWidth="0.9" strokeOpacity="0.6" />
        <line x1="330" y1="128" x2="330" y2="142" stroke="#3b82f6" strokeWidth="0.9" strokeOpacity="0.6" />
        <line x1="199" y1="60"  x2="211" y2="60"  stroke="#3b82f6" strokeWidth="0.9" strokeOpacity="0.6" />
        <line x1="199" y1="228" x2="211" y2="228" stroke="#3b82f6" strokeWidth="0.9" strokeOpacity="0.6" />

        {/* Corner brackets — left lower, right higher to match asymmetry */}
        <path d="M58,128 L32,128 L32,162" fill="none" stroke="#3b82f6" strokeWidth="1.3" strokeOpacity="0.42" />
        <path d="M58,196 L32,196 L32,162" fill="none" stroke="#3b82f6" strokeWidth="1.3" strokeOpacity="0.42" />
        <path d="M355,98  L385,98  L385,125" fill="none" stroke="#3b82f6" strokeWidth="1.3" strokeOpacity="0.42" />
        <path d="M355,152 L385,152 L385,125" fill="none" stroke="#3b82f6" strokeWidth="1.3" strokeOpacity="0.42" />

        <text x={CX} y="282" textAnchor="middle" fill="#3b82f6" fillOpacity="0.28"
          fontSize="9" fontFamily="monospace" letterSpacing="5">ARIA · VISION · V2</text>
      </svg>
    </div>
  )
}

// ── Aria Insight Card ─────────────────────────────────────────────────────────
function AriaInsightCard({ portfolioCount, totalCapital }: { portfolioCount: number; totalCapital: number }) {
  const [insight, setInsight] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/market/insight?portfolio_count=${portfolioCount}&total_capital=${totalCapital}`)
      .then((r) => setInsight(r.data.insight))
      .catch(() => setInsight('Markets are active. Monitor your strategies and review Aria for updates.'))
      .finally(() => setLoading(false))
  }, [portfolioCount, totalCapital])

  return (
    <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-5 relative overflow-hidden">
      {/* Background mini eye */}
      <div className="absolute -bottom-10 -right-10 opacity-10 pointer-events-none">
        <svg width="140" height="95" viewBox="0 0 420 280">
          <path d="M10,140 Q210,18 410,140 Q210,262 10,140 Z" fill="#1d4ed8" />
          <circle cx="210" cy="140" r="78" fill="#1e40af" />
          <circle cx="210" cy="140" r="26" fill="#020509" />
        </svg>
      </div>

      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-blue-400 text-xs font-semibold tracking-widest uppercase">Aria Insight</span>
        </div>
        <Link to="/chat"
          className="text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors flex items-center gap-1 shrink-0">
          Review
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M7 17L17 7M17 7H7M17 7v10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2 max-w-2xl">
          <div className="h-3 bg-blue-900/40 rounded animate-pulse w-full" />
          <div className="h-3 bg-blue-900/40 rounded animate-pulse w-4/5" />
          <div className="h-3 bg-blue-900/40 rounded animate-pulse w-3/5" />
        </div>
      ) : (
        <p className="text-gray-200 text-sm leading-relaxed max-w-3xl">{insight}</p>
      )}
    </div>
  )
}

// ── New Portfolio Modal ────────────────────────────────────────────────────────
function NewPortfolioModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName]           = useState('')
  const [description, setDesc]    = useState('')
  const [balance, setBalance]     = useState('10000')
  const [creating, setCreating]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      await api.post('/portfolios', { name, description, starting_balance: parseFloat(balance) })
      onCreated()
      onClose()
    } finally { setCreating(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-lg">New Portfolio</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Tech Growth"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500 placeholder:text-gray-600" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">Starting Balance ($)</label>
            <input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} required min="1"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">Description <span className="normal-case text-gray-700">(optional)</span></label>
            <input value={description} onChange={(e) => setDesc(e.target.value)} placeholder="Short description"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500 placeholder:text-gray-600" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={creating}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
              {creating ? 'Creating…' : 'Create Portfolio'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-xl transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Delete Confirm Modal ───────────────────────────────────────────────────────
function DeleteConfirmModal({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: () => void }) {
  const [deleting, setDeleting] = useState(false)

  async function handleConfirm() {
    setDeleting(true)
    try {
      await onConfirm()
    } finally { setDeleting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-white font-semibold text-lg mb-2">Delete portfolio?</h3>
        <p className="text-gray-500 text-sm mb-6">
          This will permanently delete <span className="text-gray-300 font-medium">{name}</span> and all its strategies. This can't be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={handleConfirm} disabled={deleting}
            className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
            {deleting ? 'Deleting…' : 'Delete'}
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

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [tickers, setTickers]       = useState<TickerItem[]>([])
  const [showModal, setShowModal]   = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Portfolio | null>(null)
  const marketOpen = isMarketOpen()
  const username   = user?.email?.split('@')[0] ?? ''

  async function fetchPortfolios() {
    const { data } = await api.get('/portfolios')
    setPortfolios(data)
  }

  useEffect(() => {
    fetchPortfolios()
    api.get('/market/tickers').then((r) => setTickers(r.data)).catch(() => {})
  }, [])

  async function handleDelete() {
    if (!deleteTarget) return
    await api.delete(`/portfolios/${deleteTarget.id}`)
    setPortfolios((prev) => prev.filter((p) => p.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  const totalCapital = portfolios.reduce((s, p) => s + p.starting_balance, 0)
  const memberSince  = portfolios.length
    ? new Date(portfolios[portfolios.length - 1].created_at)
        .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '—'

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Ticker tape */}
      <TickerTape tickers={tickers} />

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-gray-800/50"
        style={{ background: 'linear-gradient(135deg, #020818 0%, #050d1f 50%, #040a18 100%)' }}>
        <div className="max-w-7xl mx-auto px-8 py-14 grid grid-cols-2 gap-8 items-center">
          {/* Left */}
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span className={`w-2 h-2 rounded-full ${marketOpen ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
              <span className="text-xs font-semibold tracking-widest uppercase text-blue-400">
                {marketOpen ? 'Markets are open · Watching' : 'Markets closed · Standby'}
              </span>
            </div>

            <h1 className="text-5xl font-black leading-tight mb-4">
              {greeting()},&nbsp;
              <span className="text-blue-400">{username}</span>
            </h1>
            <p className="text-gray-400 text-base leading-relaxed mb-8 max-w-md">
              Your algorithms never sleep. Manage portfolios, ship strategies, and let Aria do the rest.
            </p>

            <div className="flex items-center gap-3">
              <button onClick={() => setShowModal(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl transition-all text-sm shadow-lg shadow-blue-900/30">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                New Portfolio
              </button>
              <button onClick={() => portfolios[0] && navigate(`/portfolios/${portfolios[0].id}`)}
                className="flex items-center gap-2 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white font-medium px-6 py-3 rounded-xl transition-all text-sm hover:bg-gray-800/50">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Open Strategies
              </button>
            </div>
          </div>

          {/* Right — hawkeye */}
          <div className="flex justify-center items-center h-72">
            <HawkEye />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { label: 'PORTFOLIOS',    value: String(portfolios.length), sub: 'active' },
            { label: 'TOTAL CAPITAL', value: `$${totalCapital.toLocaleString()}`, sub: '+0.00% today' },
            { label: 'WATCHING SINCE',value: memberSince, sub: 'uptime 100%' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-gray-900/60 border border-gray-800/60 rounded-xl px-5 py-4">
              <p className="text-gray-600 text-xs font-semibold tracking-widest uppercase mb-2 flex items-center gap-1.5">
                <svg className="w-3 h-3 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4" /></svg>
                {label}
              </p>
              <p className="text-3xl font-black text-white mb-0.5">{value}</p>
              <p className="text-gray-600 text-xs">{sub}</p>
            </div>
          ))}
        </div>

        {/* Portfolios section */}
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white">Your Portfolios</h2>
            <p className="text-gray-600 text-sm mt-0.5">Each portfolio is monitored in real time.</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            New Portfolio
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {portfolios.map((p) => {
            const pts = sparkPoints(p.id)
            const gradientId = `spark-grad-${p.id}`
            return (
              <div key={p.id} onClick={() => navigate(`/portfolios/${p.id}`)}
                className="group bg-gray-900/60 border border-gray-800/60 hover:border-blue-800/50 rounded-xl p-5 cursor-pointer transition-all hover:bg-gray-900">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-black shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-white text-sm truncate">{p.name}</h3>
                      <p className="text-gray-500 text-xs truncate">{p.description || 'Portfolio'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(p) }}
                      className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1 -m-1"
                      title="Delete portfolio">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-emerald-400 text-xs font-semibold">LIVE</span>
                    </div>
                  </div>
                </div>

                {/* Decorative area sparkline */}
                <div className="mb-3">
                  <svg width="198" height="40" viewBox="0 0 198 40" className="w-full">
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={sparkAreaPath(pts, 40)} fill={`url(#${gradientId})`} stroke="none" />
                    <path d={sparkLinePath(pts)} fill="none" stroke="#10b981" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-800/60">
                  <span className="text-white text-sm font-semibold">${p.starting_balance.toLocaleString()}</span>
                  <span className="text-xs text-gray-600 group-hover:text-blue-400 transition-colors">
                    View strategies →
                  </span>
                </div>
              </div>
            )
          })}

          {/* + New portfolio card */}
          <div onClick={() => setShowModal(true)}
            className="border border-dashed border-gray-800 hover:border-gray-700 rounded-xl p-5 cursor-pointer transition-all hover:bg-gray-900/40 flex flex-col items-center justify-center gap-2 min-h-[200px]">
            <div className="w-10 h-10 rounded-full border border-gray-700 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-sm text-gray-600">New portfolio</span>
            <span className="text-xs text-gray-700">Start a new strategy bundle</span>
          </div>
        </div>

        {/* Aria Insight bar */}
        {portfolios.length > 0 && (
          <AriaInsightCard portfolioCount={portfolios.length} totalCapital={totalCapital} />
        )}
      </div>

      {showModal && (
        <NewPortfolioModal onClose={() => setShowModal(false)} onCreated={fetchPortfolios} />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          name={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
