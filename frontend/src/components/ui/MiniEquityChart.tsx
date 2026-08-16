import { AreaChart, Area, ResponsiveContainer, ReferenceLine, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { EquityPoint } from '../../api/performance'

function fmtAxisUsd(v: number): string {
  return Math.abs(v) >= 10000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`
}

export default function MiniEquityChart({
  curve,
  positive,
  height = 64,
  showAxis = false,
  showTooltip = false,
}: {
  curve: EquityPoint[]
  positive: boolean
  height?: number
  showAxis?: boolean
  showTooltip?: boolean
}) {
  if (curve.length < 2) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-gray-700 bg-gray-950/40 rounded-lg">
        Not enough history yet
      </div>
    )
  }
  const color = positive ? '#10b981' : '#f87171'
  const gradientId = `perf-grad-${Math.random().toString(36).slice(2)}`
  const values = curve.map((p) => p.value)
  const crossesZero = Math.min(...values) < 0 && Math.max(...values) > 0
  // Cap the number of x-axis labels shown regardless of how many data points exist —
  // a year of daily backtest points would otherwise render a dense, unreadable tick wall.
  const xTickInterval = Math.max(0, Math.floor(curve.length / 6) - 1)

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={curve} margin={{ top: 6, right: 4, bottom: showAxis ? 0 : 4, left: showAxis ? -12 : 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {showAxis && <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />}
          {crossesZero && <ReferenceLine y={0} stroke="#374151" strokeDasharray="3 3" />}
          {showAxis && (
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickFormatter={(v) => (v === 'now' ? 'now' : String(v).slice(5))}
              interval={xTickInterval}
              axisLine={false}
              tickLine={false}
            />
          )}
          {showAxis && (
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickFormatter={fmtAxisUsd}
              axisLine={false}
              tickLine={false}
              width={52}
            />
          )}
          {showTooltip && (
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(v: number) => [fmtAxisUsd(v), 'Value']}
            />
          )}
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.75} fill={`url(#${gradientId})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
