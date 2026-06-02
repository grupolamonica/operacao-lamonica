import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type SlaDashboardPayload = {
  period:           'today' | '7d' | '30d'
  pctOnTime:        number
  totalCompleted:   number
  onTimeCount:      number
  breakdownByClient: Array<{ clientId: string; clientName: string; total: number; onTime: number; pct: number }>
  liveCounts:       { no_prazo: number; em_risco: number; quebrado: number; multa: number }
}

export function useSlaDashboard(period: SlaDashboardPayload['period'] = '7d') {
  return useQuery({
    queryKey: ['sla-dashboard', period],
    queryFn: async (): Promise<SlaDashboardPayload> => {
      const { data, error } = await (api.api.sla as any).dashboard.get({ query: { period } })
      if (error) throw new Error('Failed to load SLA dashboard')
      return data as SlaDashboardPayload
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}
