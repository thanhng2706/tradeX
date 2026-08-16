export interface EventMeta {
  label: string
  color: string
  dot: string
}

// Union of every event type emitted across backtests, paper trading, and broker
// deployments (BUY/SELL/SUPPRESSED/COMPLETE come from the shared backtest engine;
// ORDER_*/DEPLOYMENT_PAUSED/POSITION_CLOSED come from the live broker scheduler).
export const EVENT_META: Record<string, EventMeta> = {
  BUY_SIGNAL: { label: 'Buy Signal', color: 'text-blue-400', dot: 'bg-blue-400' },
  SELL_SIGNAL: { label: 'Sell Signal', color: 'text-purple-400', dot: 'bg-purple-400' },
  SIGNAL_SUPPRESSED: { label: 'Signal Suppressed', color: 'text-yellow-500', dot: 'bg-yellow-500' },
  ORDER_SUBMITTED: { label: 'Order Submitted', color: 'text-green-400', dot: 'bg-green-400' },
  ORDER_FILLED: { label: 'Order Filled', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  ORDER_REJECTED: { label: 'Order Rejected', color: 'text-red-400', dot: 'bg-red-400' },
  DEPLOYMENT_PAUSED: { label: 'Deployment Paused', color: 'text-red-400', dot: 'bg-red-400' },
  ORDER_BLOCKED_CAP: { label: 'Order Blocked (Guardrail)', color: 'text-amber-400', dot: 'bg-amber-400' },
  POSITION_CLOSED: { label: 'Position Closed', color: 'text-orange-400', dot: 'bg-orange-400' },
  BACKTEST_COMPLETE: { label: 'Complete', color: 'text-gray-400', dot: 'bg-gray-400' },
}

export const DEFAULT_EVENT_META: EventMeta = { label: '', color: 'text-gray-400', dot: 'bg-gray-500' }

export function eventMeta(type: string): EventMeta {
  return EVENT_META[type] ?? { ...DEFAULT_EVENT_META, label: type }
}
