import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'blue' | 'emerald' | 'purple' | 'orange' | 'green' | 'red' | 'amber'

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-gray-800 border border-gray-700/60 text-gray-400',
  blue: 'bg-blue-900/40 text-blue-300 border border-blue-800/60',
  emerald: 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/60',
  purple: 'bg-purple-900/40 text-purple-300 border border-purple-800/60',
  orange: 'bg-orange-900/40 text-orange-300 border border-orange-800/60',
  green: 'bg-green-900/40 text-green-400 border border-green-800/60',
  red: 'bg-red-900/40 text-red-400 border border-red-800/60',
  amber: 'bg-amber-900/40 text-amber-400 border border-amber-800/60',
}

export default function Badge({
  children,
  tone = 'neutral',
  mono = false,
  pill = true,
  className = '',
}: {
  children: ReactNode
  tone?: BadgeTone
  mono?: boolean
  pill?: boolean
  className?: string
}) {
  return (
    <span
      className={`text-xs px-2.5 py-0.5 font-medium ${pill ? 'rounded-full' : 'rounded'} ${mono ? 'font-mono' : ''} ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
