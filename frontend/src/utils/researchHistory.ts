const KEY = 'tradex_research_history'
const MAX = 10

export function getHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function addToHistory(symbol: string) {
  const sym = symbol.toUpperCase()
  const existing = getHistory().filter((s) => s !== sym)
  const updated = [sym, ...existing].slice(0, MAX)
  localStorage.setItem(KEY, JSON.stringify(updated))
}
