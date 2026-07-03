import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const RESEARCH_ITEMS = [
  { to: '/research', label: 'Stock Search' },
  { to: '/research/screener', label: 'Screener' },
  { to: '/research/deep-dive', label: 'Deep Dive' },
]

function ResearchDropdown() {
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
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800/60 transition-all flex items-center gap-1"
      >
        Research
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full pt-2 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl py-1.5 min-w-[160px]">
            {RESEARCH_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800/60 hover:text-white transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Top navbar */}
      <nav className="h-14 border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-sm px-6 flex items-center gap-5 sticky top-0 z-50 shrink-0">
        <Link to="/" className="flex items-center gap-2.5 mr-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-black">TX</span>
          </div>
          <span className="font-bold text-white text-sm tracking-tight">Tradex</span>
        </Link>

        <div className="h-4 w-px bg-gray-800" />

        <Link
          to="/"
          className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800/60 transition-all"
        >
          Dashboard
        </Link>
        <Link
          to="/portfolios"
          className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800/60 transition-all"
        >
          Portfolios
        </Link>
        <Link
          to="/library"
          className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800/60 transition-all"
        >
          Library
        </Link>
        <Link
          to="/watchlists"
          className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800/60 transition-all"
        >
          Watchlists
        </Link>
        <ResearchDropdown />
        <Link
          to="/chat"
          className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800/60 transition-all flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          </svg>
          Aria
        </Link>

        <div className="ml-auto flex items-center gap-4">
          {user?.email && (
            <span className="text-xs text-gray-600 hidden sm:block">{user.email}</span>
          )}
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-700 px-3 py-1.5 rounded-lg transition-all"
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="flex-1">{children}</div>
    </div>
  )
}
