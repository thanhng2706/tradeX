import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import ReactMarkdown from 'react-markdown'
import { researchApi, StockInfo, ChartPoint, FinancialsRow } from '../api/research'
import { addToHistory } from '../utils/researchHistory'

const PERIODS = [
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: '5Y', value: '5y' },
  { label: 'Max', value: 'max' },
]

const LOGO_COLORS: Record<string, string> = {
  A: '#3b82f6', B: '#8b5cf6', C: '#10b981', D: '#f59e0b', E: '#ef4444',
  F: '#06b6d4', G: '#84cc16', H: '#f97316', I: '#6366f1', J: '#ec4899',
  K: '#14b8a6', L: '#a855f7', M: '#22c55e', N: '#eab308', O: '#64748b',
  P: '#0ea5e9', Q: '#d946ef', R: '#f43f5e', S: '#fb923c', T: '#a3e635',
  U: '#38bdf8', V: '#c084fc', W: '#4ade80', X: '#fbbf24', Y: '#818cf8', Z: '#34d399',
}

function StockLogo({ symbol }: { symbol: string }) {
  const [errored, setErrored] = useState(false)
  const initial = symbol[0]?.toUpperCase() ?? '?'
  const bg = LOGO_COLORS[initial] ?? '#6b7280'

  if (!errored) {
    return (
      <img
        src={`https://financialmodelingprep.com/image-stock/${symbol}.png`}
        alt={symbol}
        onError={() => setErrored(true)}
        className="w-12 h-12 rounded-full object-contain bg-gray-800"
      />
    )
  }
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0"
      style={{ background: bg }}
    >
      {initial}
    </div>
  )
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', VND: '₫', KRW: '₩',
  INR: '₹', HKD: 'HK$', CAD: 'C$', AUD: 'A$', CHF: 'CHF ', SGD: 'S$', BRL: 'R$',
}

function currencySymbol(code: string | null | undefined): string {
  if (!code) return '$'
  return CURRENCY_SYMBOLS[code] ?? `${code} `
}

function formatCompact(n: number | null | undefined, symbol = '$'): string {
  if (n == null) return 'N/A'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${symbol}${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${symbol}${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${symbol}${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${symbol}${(n / 1e3).toFixed(2)}K`
  return `${symbol}${n.toFixed(2)}`
}

function formatCompactNum(n: number | null | undefined): string {
  if (n == null) return 'N/A'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`
  return n.toFixed(2)
}

function formatNum(n: number | null | undefined, digits = 2): string {
  if (n == null) return 'N/A'
  return n.toFixed(digits)
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <p className="text-white text-sm font-semibold">{value}</p>
    </div>
  )
}

export default function StockPage() {
  const { symbol = '' } = useParams()
  const navigate = useNavigate()
  const [info, setInfo] = useState<StockInfo | null>(null)
  const [chart, setChart] = useState<ChartPoint[]>([])
  const [financials, setFinancials] = useState<FinancialsRow[]>([])
  const [period, setPeriod] = useState('3mo')
  const [loading, setLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(true)
  const [error, setError] = useState('')
  const [report, setReport] = useState('')
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    researchApi.getStock(symbol)
      .then((data) => { setInfo(data); addToHistory(symbol) })
      .catch(() => setError(`Could not find ticker '${symbol}'`))
      .finally(() => setLoading(false))
    researchApi.getFinancials(symbol).then(setFinancials).catch(() => setFinancials([]))
  }, [symbol])

  useEffect(() => {
    setChartLoading(true)
    researchApi.getHistory(symbol, period).then(setChart).catch(() => setChart([])).finally(() => setChartLoading(false))
  }, [symbol, period])

  useEffect(() => {
    setReport('')
    setReportError('')
  }, [symbol])

  async function handleGenerateReport() {
    setReportLoading(true)
    setReportError('')
    setReport('')
    try {
      const text = await researchApi.generateReport(symbol)
      setReport(text)
    } catch {
      setReportError('Could not generate report right now.')
    } finally {
      setReportLoading(false)
    }
  }

  const minP = chart.length ? Math.min(...chart.map((d) => d.close)) : 0
  const maxP = chart.length ? Math.max(...chart.map((d) => d.close)) : 0
  const pad = (maxP - minP) * 0.08 || 1

  if (loading) {
    return <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] text-gray-500 text-sm">Loading…</div>
  }

  if (error || !info) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] gap-3 text-gray-500">
        <p className="text-sm">{error || 'Not found'}</p>
        <button onClick={() => navigate('/research')} className="text-blue-400 hover:text-blue-300 text-sm">← Back to Research</button>
      </div>
    )
  }

  const positive = (info.change_pct ?? 0) >= 0
  const changeColor = positive ? 'text-emerald-400' : 'text-red-400'
  const cur = currencySymbol(info.currency)

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <button onClick={() => navigate('/research')} className="text-gray-500 hover:text-white text-sm mb-6 transition-colors">
        ← Back to Research
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <StockLogo symbol={info.symbol} />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-white text-2xl font-bold">{info.symbol}</h1>
            <span className="text-gray-500 text-sm">{info.name}</span>
          </div>
          <p className="text-gray-600 text-xs mt-0.5">
            {info.exchange} {info.sector && `• ${info.sector}`} {info.industry && `• ${info.industry}`}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-white text-2xl font-bold">{info.price != null ? `${cur}${info.price.toFixed(2)}` : 'N/A'}</p>
          {info.change_pct != null && (
            <p className={`text-sm font-medium ${changeColor}`}>
              {positive ? '▲' : '▼'} {positive ? '+' : ''}{info.change_pct.toFixed(2)}%
            </p>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-end gap-1 mb-3">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                period === p.value ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-white hover:bg-gray-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {chartLoading ? (
          <div className="h-64 flex items-center justify-center text-gray-500 text-sm">Loading chart…</div>
        ) : !chart.length ? (
          <div className="h-64 flex items-center justify-center text-gray-500 text-sm">No data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[minP - pad, maxP + pad]} tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v) => `${cur}${v.toFixed(0)}`} width={60} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#9ca3af', fontSize: 11 }}
                formatter={(v: number) => [`${cur}${v.toFixed(2)}`, 'Close']}
              />
              <Line type="monotone" dataKey="close" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Fundamentals */}
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Fundamentals</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="Market Cap" value={formatCompact(info.market_cap, cur)} />
        <StatCard label="PE Ratio" value={formatNum(info.pe_ratio)} />
        <StatCard label="Forward PE" value={formatNum(info.forward_pe)} />
        <StatCard label="PS Ratio" value={formatNum(info.ps_ratio)} />
        <StatCard label="Price/Book" value={formatNum(info.price_to_book)} />
        <StatCard label="Dividend Yield" value={info.dividend_yield != null ? `${info.dividend_yield.toFixed(2)}%` : 'N/A'} />
        <StatCard label="EPS (TTM)" value={info.eps != null ? `${cur}${info.eps.toFixed(2)}` : 'N/A'} />
        <StatCard label="Forward EPS" value={info.forward_eps != null ? `${cur}${info.forward_eps.toFixed(2)}` : 'N/A'} />
        <StatCard label="Revenue" value={formatCompact(info.revenue, '$')} />
        <StatCard label="Gross Profit" value={formatCompact(info.gross_profit, '$')} />
        <StatCard label="EBITDA" value={formatCompact(info.ebitda, '$')} />
        <StatCard label="Free Cash Flow" value={formatCompact(info.free_cash_flow, '$')} />
        <StatCard label="Total Debt" value={formatCompact(info.total_debt, '$')} />
        <StatCard label="Total Cash" value={formatCompact(info.total_cash, '$')} />
        <StatCard label="Enterprise Value" value={formatCompact(info.enterprise_value, '$')} />
        <StatCard label="Beta" value={formatNum(info.beta)} />
        <StatCard label="52W High" value={info.fifty_two_week_high != null ? `${cur}${info.fifty_two_week_high.toFixed(2)}` : 'N/A'} />
        <StatCard label="52W Low" value={info.fifty_two_week_low != null ? `${cur}${info.fifty_two_week_low.toFixed(2)}` : 'N/A'} />
        <StatCard label="Avg Volume" value={info.avg_volume != null ? info.avg_volume.toLocaleString() : 'N/A'} />
        <StatCard label="Shares Out." value={formatCompactNum(info.shares_outstanding)} />
      </div>

      {/* AI Stock Report */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-8">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <p className="text-white text-sm font-semibold">AI Stock Report</p>
          </div>
          <button
            onClick={handleGenerateReport}
            disabled={reportLoading}
            className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3.5 py-1.5 rounded-lg transition-colors font-medium"
          >
            {reportLoading ? 'Generating…' : report ? 'Regenerate' : 'Generate Report'}
          </button>
        </div>
        {reportLoading && (
          <p className="text-gray-500 text-sm mt-3">Aria is analyzing {info.symbol}'s fundamentals…</p>
        )}
        {reportError && <p className="text-red-400 text-sm mt-3">{reportError}</p>}
        {report && !reportLoading && (
          <div className="mt-3 text-sm leading-relaxed">
            <ReactMarkdown components={{
              h2: ({ children }) => <h3 className="text-white font-semibold text-sm mt-4 mb-1.5 first:mt-0">{children}</h3>,
              p: ({ children }) => <p className="text-gray-300 mb-2">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
              ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5 text-gray-300">{children}</ul>,
              li: ({ children }) => <li>{children}</li>,
            }}>
              {report}
            </ReactMarkdown>
          </div>
        )}
        {!report && !reportLoading && !reportError && (
          <p className="text-gray-500 text-sm mt-3">Generate an AI-powered analysis covering financial health, competitive positioning, growth drivers, and valuation.</p>
        )}
      </div>

      {/* Description */}
      {info.description && (
        <>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">About</p>
          <p className="text-gray-400 text-sm leading-relaxed mb-8">{info.description}</p>
        </>
      )}

      {/* Financials table */}
      {financials.length > 0 && (
        <>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Historical Financials (Annual)</p>
          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800/60 text-gray-500 text-xs">
                  <th className="text-left py-2 px-3 font-medium">Metric</th>
                  {financials.map((f) => (
                    <th key={f.period} className="text-right py-2 px-3 font-medium">{f.period.slice(0, 7)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Revenue', 'revenue'],
                  ['Gross Profit', 'gross_profit'],
                  ['Operating Income', 'operating_income'],
                  ['Net Income', 'net_income'],
                  ['EBITDA', 'ebitda'],
                  ['Total Assets', 'total_assets'],
                  ['Total Liabilities', 'total_liabilities'],
                  ['Free Cash Flow', 'free_cash_flow'],
                ].map(([label, key]) => (
                  <tr key={key} className="border-b border-gray-800/40">
                    <td className="py-2.5 px-3 text-gray-400">{label}</td>
                    {financials.map((f) => (
                      <td key={f.period} className="py-2.5 px-3 text-right text-white">
                        {formatCompact((f as any)[key], '$')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
