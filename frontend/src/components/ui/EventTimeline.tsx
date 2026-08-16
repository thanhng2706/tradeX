import { useState } from 'react'
import { eventMeta } from '../../constants/eventMeta'

export interface TimelineEvent {
  date: string
  type: string
  message: string
}

export default function EventTimeline({
  events,
  truncated,
}: {
  events: TimelineEvent[]
  truncated?: boolean
}) {
  const [open, setOpen] = useState(false)

  if (events.length === 0) return null

  return (
    <div className="bg-gray-900 rounded-xl p-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 font-semibold text-sm w-full text-left"
      >
        <span>Event Timeline</span>
        <span className="text-gray-500">({events.length} event{events.length !== 1 ? 's' : ''})</span>
        <span className="ml-auto text-gray-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-2.5 max-h-96 overflow-y-auto">
          {truncated && (
            <p className="text-yellow-500 text-xs mb-2">
              Event log truncated to the most recent {events.length} events.
            </p>
          )}
          {events.map((e, i) => {
            const meta = eventMeta(e.type)
            return (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-500">{e.date}</span>
                    <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                  </div>
                  <p className="text-gray-400 text-sm">{e.message}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
