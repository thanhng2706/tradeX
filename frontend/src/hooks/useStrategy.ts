import { useEffect, useState } from 'react'
import { strategiesApi, Strategy } from '../api/strategies'

export function useStrategy(portfolioId: number, strategyId: number) {
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    strategiesApi.list(portfolioId).then((list) => {
      if (cancelled) return
      setStrategy(list.find((s) => s.id === strategyId) ?? null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [portfolioId, strategyId])

  return { strategy, loading }
}
