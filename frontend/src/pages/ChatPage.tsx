import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import api from '../api/client'
import { chatApi, ChatAction, StrategyReadyData, BacktestResultData } from '../api/chat'
import { strategiesApi } from '../api/strategies'

interface Portfolio {
  id: number
  name: string
}

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  actions?: ChatAction[]
}

interface SavedConversation {
  id: string
  title: string
  savedAt: number
  messages: ConversationMessage[]
}

const HISTORY_KEY = 'tradex_aria_history'
const MAX_HISTORY = 30

const SUGGESTIONS = [
  'Build a Golden Cross strategy for SPY',
  'Create a MACD momentum strategy for QQQ and backtest it',
  'What is the difference between RSI and MACD?',
  'Build and backtest a Bollinger Band bounce strategy for AAPL',
  'Create an RSI oversold reversal strategy',
]

function loadHistory(): SavedConversation[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') }
  catch { return [] }
}

function persistHistory(convs: SavedConversation[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(convs.slice(0, MAX_HISTORY)))
}

function saveConversation(messages: ConversationMessage[], existingId?: string): SavedConversation {
  const title = messages.find((m) => m.role === 'user')?.content.slice(0, 60) ?? 'Conversation'
  const id = existingId ?? Date.now().toString()
  const record: SavedConversation = { id, title, savedAt: Date.now(), messages }
  const existing = loadHistory().filter((c) => c.id !== id)
  persistHistory([record, ...existing])
  return record
}

function fmtRule(rule: any): string {
  const p = Object.values(rule.params ?? {}).join(',')
  const left = p ? `${rule.indicator}(${p})` : rule.indicator
  if (rule.right_indicator) {
    const rp = Object.values(rule.right_params ?? {}).join(',')
    const right = rp ? `${rule.right_indicator}(${rp})` : rule.right_indicator
    return `${left} ${rule.operator.replace(/_/g, ' ')} ${right}`
  }
  return `${left} ${rule.operator} ${rule.value ?? ''}`
}

function fmtMetric(val: number | undefined, decimals = 1) {
  return val == null ? '—' : val.toFixed(decimals)
}

// ── Save Modal ───────────────────────────────────────────────────────────────
function SaveModal({ data, portfolios, onClose, onSaved }: {
  data: StrategyReadyData
  portfolios: Portfolio[]
  onClose: () => void
  onSaved: (name: string) => void
}) {
  const [saving, setSaving] = useState(false)

  async function save(p: Portfolio) {
    setSaving(true)
    try {
      await strategiesApi.create(p.id, {
        name: data.name,
        description: data.description || '',
        ticker: data.ticker,
        buy_conditions: data.buy_conditions as any,
        sell_conditions: data.sell_conditions as any,
        position_size_pct: data.position_size_pct,
      })
      onSaved(p.name)
    } catch { /* silent */ }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">Save to Portfolio</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="bg-gray-800 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
          <span className="text-sm font-medium text-white">{data.name}</span>
          <span className="text-xs font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-md">{data.ticker}</span>
        </div>
        <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Choose a portfolio</p>
        {portfolios.length === 0
          ? <p className="text-sm text-gray-500 py-4 text-center">No portfolios yet.</p>
          : <div className="space-y-2">
            {portfolios.map((p) => (
              <button key={p.id} onClick={() => save(p)} disabled={saving}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500/50 text-white text-sm font-medium transition-all disabled:opacity-50 group">
                <span>{p.name}</span>
                <svg className="w-4 h-4 text-gray-500 group-hover:text-blue-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        }
        <button onClick={onClose} className="mt-4 w-full text-sm text-gray-500 hover:text-gray-300 py-2 transition-colors">Cancel</button>
      </div>
    </div>
  )
}

// ── Strategy + Backtest Cards ────────────────────────────────────────────────
function StrategyCard({ data, onOpenSave, savedTo }: {
  data: StrategyReadyData
  onOpenSave: (d: StrategyReadyData) => void
  savedTo?: string
}) {
  return (
    <div className="mt-3 bg-gray-800/80 rounded-xl border border-gray-700/50 p-4 max-w-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-white text-sm">{data.name}</p>
          {data.description && <p className="text-xs text-gray-400 mt-0.5">{data.description}</p>}
        </div>
        <span className="text-xs font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-md shrink-0">{data.ticker}</span>
      </div>
      <div className="space-y-1.5 mb-3">
        {(['buy', 'sell'] as const).map((side) => {
          const cond = side === 'buy' ? data.buy_conditions : data.sell_conditions
          return (
            <div key={side}>
              <span className={`text-xs font-medium uppercase tracking-wide ${side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                {side} when
              </span>
              <div className="mt-0.5 space-y-0.5">
                {cond.rules.map((r, i) => (
                  <p key={i} className="text-xs font-mono text-gray-300 bg-gray-900/60 rounded px-2 py-0.5">
                    {i > 0 && <span className="text-gray-500 mr-1">{cond.logic}</span>}
                    {fmtRule(r)}
                  </p>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {savedTo ? (
        <div className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Saved to "{savedTo}"
        </div>
      ) : (
        <button onClick={() => onOpenSave(data)}
          className="w-full text-sm py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors">
          Save to Portfolio
        </button>
      )}
    </div>
  )
}

function BacktestCard({ data }: { data: BacktestResultData }) {
  const rc = data.total_return_pct >= 0 ? 'text-green-400' : 'text-red-400'
  const metrics = [
    { label: 'Total Return', value: `${fmtMetric(data.total_return_pct)}%`, color: rc },
    { label: 'Ann. Return', value: `${fmtMetric(data.annualized_return_pct)}%`, color: rc },
    { label: 'Sharpe', value: fmtMetric(data.sharpe_ratio, 2), color: data.sharpe_ratio >= 1 ? 'text-green-400' : 'text-yellow-400' },
    { label: 'Max Drawdown', value: `${fmtMetric(data.max_drawdown_pct)}%`, color: 'text-red-400' },
    { label: 'Win Rate', value: `${fmtMetric(data.win_rate)}%`, color: undefined },
    { label: 'Trades', value: String(data.num_trades ?? 0), color: undefined },
  ]
  return (
    <div className="mt-3 bg-gray-800/80 rounded-xl border border-gray-700/50 p-4 max-w-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-white text-sm">Backtest: {data.ticker}</p>
        <span className="text-xs text-gray-500">{data.start_date} → {data.end_date}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {metrics.map(({ label, value, color }) => (
          <div key={label} className="bg-gray-900 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-0.5">{label}</p>
            <p className={`text-base font-bold ${color ?? 'text-white'}`}>{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-gray-500">
        <span>Start: ${(data.starting_balance ?? 0).toLocaleString()}</span>
        <span>End: ${(data.final_value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
      </div>
    </div>
  )
}

// ── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, onOpenSave, savedMap }: {
  msg: ConversationMessage
  onOpenSave: (d: StrategyReadyData) => void
  savedMap: Record<string, string>
}) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0 mr-2 mt-0.5">
          <span className="text-white text-[10px] font-bold">A</span>
        </div>
      )}
      <div className={`max-w-[80%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isUser ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-800 text-gray-100 rounded-bl-sm'
        }`}>
          {isUser ? (
            <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
          ) : (
            <ReactMarkdown components={{
              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
              ul: ({ children }) => <ul className="list-disc list-inside mt-1 mb-1 space-y-0.5">{children}</ul>,
              li: ({ children }) => <li className="text-gray-200">{children}</li>,
            }}>
              {msg.content}
            </ReactMarkdown>
          )}
        </div>
        {(msg.actions ?? []).map((action, i) =>
          action.type === 'strategy_ready' ? (
            <StrategyCard key={i} data={action.data as StrategyReadyData} onOpenSave={onOpenSave}
              savedTo={savedMap[(action.data as StrategyReadyData).name]} />
          ) : action.type === 'backtest_result' ? (
            <BacktestCard key={i} data={action.data as BacktestResultData} />
          ) : null
        )}
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [currentId, setCurrentId] = useState<string | undefined>()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [saveModal, setSaveModal] = useState<StrategyReadyData | null>(null)
  const [savedMap, setSavedMap] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<SavedConversation[]>(loadHistory)
  const bottomRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef(0) // incremented on new chat to discard in-flight responses

  useEffect(() => {
    api.get<Portfolio[]>('/portfolios').then((r) => setPortfolios(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Auto-save only once there's a complete exchange (user + at least one assistant reply)
  useEffect(() => {
    if (messages.length === 0) return
    if (!messages.some((m) => m.role === 'assistant')) return
    const saved = saveConversation(messages, currentId)
    if (!currentId) setCurrentId(saved.id)
    setHistory(loadHistory())
  }, [messages])

  function startNewChat() {
    sessionRef.current += 1  // invalidate any in-flight response
    setMessages([])
    setCurrentId(undefined)
    setSavedMap({})
    setLoading(false)
  }

  function restoreConversation(conv: SavedConversation) {
    sessionRef.current += 1  // discard any in-flight response
    setMessages(conv.messages)
    setCurrentId(conv.id)
    setSavedMap({})
    setLoading(false)
  }

  function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const updated = loadHistory().filter((c) => c.id !== id)
    persistHistory(updated)
    setHistory(updated)
    if (id === currentId) startNewChat()
  }

  async function send(text: string = input.trim()) {
    if (!text || loading) return
    setInput('')
    const textarea = document.querySelector('textarea')
    if (textarea) textarea.style.height = 'auto'
    const userMsg: ConversationMessage = { role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setLoading(true)
    const sid = sessionRef.current
    try {
      const resp = await chatApi.send(next.map((m) => ({ role: m.role, content: m.content })))
      if (sessionRef.current !== sid) return  // user started a new chat — discard
      setMessages([...next, { role: 'assistant', content: resp.message, actions: resp.actions ?? [] }])
    } catch {
      if (sessionRef.current !== sid) return
      setMessages([...next, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      if (sessionRef.current === sid) setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-gray-950 text-white overflow-hidden">
      {/* ── Left Sidebar ── */}
      <aside className="w-60 shrink-0 flex flex-col bg-gray-900 border-r border-gray-800/60">
        {/* New Chat */}
        <div className="px-3 pt-3 pb-2">
          <button
            onClick={startNewChat}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-all"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            New chat
          </button>
        </div>

        <div className="mx-3 border-t border-gray-800/60 my-1" />

        {/* History */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {history.length === 0 ? (
            <p className="text-xs text-gray-600 px-3 py-2">No conversations yet</p>
          ) : (
            <>
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-3 mb-1">Recents</p>
              <div className="space-y-0.5">
                {history.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => restoreConversation(conv)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all group flex items-center gap-1 ${
                      conv.id === currentId
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <span className="flex-1 truncate">{conv.title}</span>
                    <span
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                      </svg>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ── Chat Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-2xl mx-auto">
            {isEmpty ? (
              <div className="text-center pt-16 pb-6">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center mx-auto mb-4">
                  <span className="text-white text-xl font-bold">A</span>
                </div>
                <h2 className="text-2xl font-semibold text-white mb-2">Hi, I'm Aria</h2>
                <p className="text-gray-400 text-sm mb-8">
                  I can build trading strategies, run backtests, and explain financial concepts.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)}
                      className="text-sm text-left px-4 py-3 rounded-xl border border-gray-800 hover:border-gray-600 hover:bg-gray-800/60 text-gray-300 transition-all">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} onOpenSave={setSaveModal} savedMap={savedMap} />
              ))
            )}

            {loading && (
              <div className="flex justify-start mb-4">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                  <span className="text-white text-[10px] font-bold">A</span>
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-gray-800">
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-gray-800/60 px-4 py-3">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end gap-2 bg-gray-800/60 border border-gray-700/60 rounded-2xl px-4 py-2.5 focus-within:border-blue-500/50 transition-colors">
              <textarea
                rows={1}
                value={input}
                onChange={autoResize}
                onKeyDown={handleKey}
                placeholder="Ask Aria to build a strategy, run a backtest, or explain a concept..."
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 resize-none outline-none leading-relaxed"
                style={{ minHeight: '24px', maxHeight: '160px' }}
                disabled={loading}
              />
              <button onClick={() => send()} disabled={!input.trim() || loading}
                className="shrink-0 w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white flex items-center justify-center transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-600 text-center mt-2">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      </div>

      {/* Save Modal */}
      {saveModal && (
        <SaveModal data={saveModal} portfolios={portfolios} onClose={() => setSaveModal(null)}
          onSaved={(name) => {
            setSavedMap((prev) => ({ ...prev, [saveModal.name]: name }))
            api.get<Portfolio[]>('/portfolios').then((r) => setPortfolios(r.data)).catch(() => {})
            setSaveModal(null)
          }} />
      )}
    </div>
  )
}
