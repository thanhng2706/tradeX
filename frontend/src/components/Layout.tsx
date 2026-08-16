import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { notificationsApi, NotificationItem } from '../api/notifications'

const NOTIF_DOT: Record<string, string> = {
  BUY_SIGNAL: 'bg-blue-400',
  SELL_SIGNAL: 'bg-purple-400',
  SIGNAL_SUPPRESSED: 'bg-yellow-500',
  ORDER_SUBMITTED: 'bg-green-400',
  ORDER_FILLED: 'bg-emerald-400',
  ORDER_REJECTED: 'bg-red-400',
  DEPLOYMENT_PAUSED: 'bg-red-400',
  ORDER_BLOCKED_CAP: 'bg-amber-400',
  POSITION_CLOSED: 'bg-orange-400',
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState<NotificationItem[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function poll() {
      notificationsApi.list().then((res) => {
        setUnreadCount(res.unread_count)
        setItems(res.items)
      }).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleOpen() {
    setOpen((v) => !v)
    if (!open && unreadCount > 0) {
      notificationsApi.markRead().then((res) => {
        setUnreadCount(res.unread_count)
        setItems(res.items)
      }).catch(() => {})
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800/60 transition-all"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full pt-2 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-80 max-h-96 overflow-y-auto">
            <div className="px-4 py-3 border-b border-gray-800/60">
              <h3 className="text-sm font-semibold text-white">Notifications</h3>
            </div>
            {items.length === 0 ? (
              <p className="text-gray-600 text-sm px-4 py-6 text-center">No trade activity yet.</p>
            ) : (
              items.map((item) => (
                <Link
                  key={item.id}
                  to={`/portfolios/${item.portfolio_id}/strategies/${item.strategy_id}/broker-deploy`}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-2.5 px-4 py-3 hover:bg-gray-800/60 transition-colors border-b border-gray-800/40 last:border-0"
                >
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${NOTIF_DOT[item.type] || 'bg-gray-500'}`} />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-300">
                      <span className="font-medium text-white">{item.strategy_name}</span> · {item.ticker}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{item.message}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const RESEARCH_ITEMS = [
  { to: '/research', label: 'Stock Search' },
  { to: '/research?tab=screener', label: 'Screener' },
  { to: '/research?tab=deepdive', label: 'Deep Dive' },
  { to: '/research?tab=watchlists', label: 'Watchlists' },
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
        <ResearchDropdown />
        <Link
          to="/broker"
          className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800/60 transition-all"
        >
          Broker
        </Link>
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
          <NotificationBell />
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
