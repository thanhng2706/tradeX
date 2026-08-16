import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { researchApi } from '../api/research'

const SUGGESTIONS = [
  { topic: 'Compare NVDA and AMD in the AI chip race', symbol: 'NVDA' },
  { topic: "Is Tesla's robotaxi bet actually working?", symbol: 'TSLA' },
  { topic: 'How exposed is Apple to a China slowdown?', symbol: 'AAPL' },
  { topic: 'The bull and bear case for the S&P 500 right now', symbol: 'SPY' },
]

export default function DeepDivePage() {
  const [topic, setTopic] = useState('')
  const [symbol, setSymbol] = useState('')
  const [report, setReport] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function runDeepDive(t: string, sym?: string) {
    if (!t.trim()) return
    setLoading(true)
    setError('')
    setReport('')
    try {
      const text = await researchApi.runDeepDive(t.trim(), sym?.trim() || undefined)
      setReport(text)
    } catch {
      setError('Could not generate the deep dive right now.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await runDeepDive(topic, symbol)
  }

  function handleSuggestion(t: string, sym: string) {
    setTopic(t)
    setSymbol(sym)
    runDeepDive(t, sym)
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-white">Deep Dive</h1>
      <p className="text-gray-600 text-sm mt-0.5 mb-6">Extensive, long-form AI research on a stock or topic.</p>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs text-gray-500 mb-1.5">Topic</label>
            <input value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Compare NVDA and AMD in the AI chip race"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600 transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Symbol <span className="text-gray-700">(optional)</span></label>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)}
              placeholder="NVDA"
              className="w-28 bg-gray-950 border border-gray-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600 uppercase transition-colors" />
          </div>
          <button type="submit" disabled={loading || !topic.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors">
            {loading ? 'Researching…' : 'Run Deep Dive'}
          </button>
        </form>
      </div>

      {!report && !loading && !error && (
        <div className="mt-4 bg-gray-900 border border-gray-800 rounded-2xl py-16 px-6 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-950/50 text-blue-400 flex items-center justify-center mb-4">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 2v6h6M9 13h6M9 17h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="text-white font-bold text-sm mb-1.5">Run a deep dive to see the report</h3>
          <p className="text-gray-500 text-xs mb-6 max-w-sm">
            Enter a topic above, or try one of these:
          </p>
          <div className="flex flex-wrap justify-center gap-2 max-w-lg">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.topic}
                onClick={() => handleSuggestion(s.topic, s.symbol)}
                className="text-xs text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700/60 px-3 py-1.5 rounded-lg transition-colors"
              >
                {s.topic}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="mt-4 bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-500 text-sm">
          Aria is cross-referencing data on "{topic}"…
        </div>
      )}
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      {report && !loading && (
        <div className="mt-4 bg-gray-900 border border-gray-800 rounded-2xl p-6 text-sm leading-relaxed">
          <ReactMarkdown components={{
            h2: ({ children }) => <h3 className="text-white font-semibold text-base mt-5 mb-2 first:mt-0">{children}</h3>,
            p: ({ children }) => <p className="text-gray-300 mb-2">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
            ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5 text-gray-300">{children}</ul>,
            li: ({ children }) => <li>{children}</li>,
          }}>
            {report}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
}
