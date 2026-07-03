import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

interface Portfolio {
  id: number
  name: string
  description: string
  starting_balance: number
  created_at: string
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

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PortfoliosPage() {
  const navigate = useNavigate()
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [showModal, setShowModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Portfolio | null>(null)

  async function fetchPortfolios() {
    const { data } = await api.get('/portfolios')
    setPortfolios(data)
  }

  useEffect(() => { fetchPortfolios() }, [])

  async function handleDelete() {
    if (!deleteTarget) return
    await api.delete(`/portfolios/${deleteTarget.id}`)
    setPortfolios((prev) => prev.filter((p) => p.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  const totalCapital = portfolios.reduce((s, p) => s + p.starting_balance, 0)

  return (
    <div className="max-w-7xl mx-auto px-8 py-10">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfolios</h1>
          <p className="text-gray-600 text-sm mt-0.5">
            {portfolios.length} portfolio{portfolios.length !== 1 ? 's' : ''} · ${totalCapital.toLocaleString()} total capital
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          New Portfolio
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
