import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { RiskSnapshot } from '@/data/types'

export function useTripRisk(tripId: string | null) {
  return useQuery({
    queryKey: ['trip-risk', tripId],
    enabled:  !!tripId,
    queryFn:  async (): Promise<RiskSnapshot | null> => {
      const { data, error } = await (api.api.trips as any)[tripId!].risk.get()
      if (error) throw new Error('Failed to fetch trip risk')
      return data as RiskSnapshot
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}
