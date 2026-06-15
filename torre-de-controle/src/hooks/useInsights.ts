import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { type PrazoRange, rangeQuery } from '@/components/domain/PrazoFinalFilter'

/**
 * Insights composite hook — 4 sub-hooks feeding the InsightsPage (Phase 6
 * Wave 3). All hooks share queryKey namespace ['insights', ...] for selective
 * invalidation. staleTime = 30 s matches backend Redis TTL (CONTEXT D-29).
 *
 * Eden Treaty bracket-notation (`api.api.insights as any)['sla-history']`)
 * required because endpoint segments contain hyphens — TS dot-notation
 * disallows `-`. Cast `as any` matches established pattern from useGeofences.
 *
 * @see api/src/modules/insights/insights.plugin.ts — endpoint contracts
 * @see api/src/modules/insights/insights.service.ts — return types
 */

export type SlaPoint = {
  date:   string
  total:  number
  onTime: number
  sla:    number
}

export type DriverRank = {
  driverId:    string
  name:        string
  code:        string
  score:       number
  slaPercent:  number
  avgDelayMin: number
  totalTrips:  number
}

export type ProblematicRoute = {
  routeId:    string
  code:       string
  name:       string
  alerts:     number
  avgDelay:   number
  slaPercent: number
}

export type AlertDist = {
  type:  string
  count: number
}

export function useSlaHistory(range: PrazoRange) {
  const q = useQuery({
    queryKey: ['insights', 'sla-history', range.inicio, range.fim],
    queryFn: async (): Promise<SlaPoint[]> => {
      const { data, error } = await (api.api.insights as any)['sla-history'].get({ query: rangeQuery(range) })
      if (error) throw new Error('Failed to fetch SLA history')
      return (data ?? []) as SlaPoint[]
    },
    staleTime: 30_000,
  })
  return {
    data:      q.data ?? [],
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

export function useDriversRanking(range: PrazoRange, limit: number = 10) {
  const q = useQuery({
    queryKey: ['insights', 'drivers-ranking', range.inicio, range.fim, limit],
    queryFn: async (): Promise<DriverRank[]> => {
      const { data, error } = await (api.api.insights as any)['drivers-ranking'].get({ query: { ...rangeQuery(range), limit } })
      if (error) throw new Error('Failed to fetch drivers ranking')
      return (data ?? []) as DriverRank[]
    },
    staleTime: 30_000,
  })
  return {
    data:      q.data ?? [],
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

export function useProblematicRoutes(range: PrazoRange) {
  const q = useQuery({
    queryKey: ['insights', 'problematic-routes', range.inicio, range.fim],
    queryFn: async (): Promise<ProblematicRoute[]> => {
      const { data, error } = await (api.api.insights as any)['problematic-routes'].get({ query: rangeQuery(range) })
      if (error) throw new Error('Failed to fetch problematic routes')
      return (data ?? []) as ProblematicRoute[]
    },
    staleTime: 30_000,
  })
  return {
    data:      q.data ?? [],
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

export function useAlertsDistribution(range: PrazoRange) {
  const q = useQuery({
    queryKey: ['insights', 'alerts-distribution', range.inicio, range.fim],
    queryFn: async (): Promise<AlertDist[]> => {
      const { data, error } = await (api.api.insights as any)['alerts-distribution'].get({ query: rangeQuery(range) })
      if (error) throw new Error('Failed to fetch alerts distribution')
      return (data ?? []) as AlertDist[]
    },
    staleTime: 30_000,
  })
  return {
    data:      q.data ?? [],
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}
