import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/formatters'

/**
 * Ranking composite hooks — 5 read-only sub-hooks feeding the Phase 8 /ranking
 * page (6 abas). All hooks share the queryKey namespace ['ranking', ...] for
 * selective invalidation. staleTime = 30 s matches the backend Redis short TTL
 * (CONTEXT — same as useInsights/useTrips).
 *
 * Consumed contract (Phase 7, FIXED — types re-exported below):
 *   GET /api/ranking/drivers       → RankedDriver[] (full array, status + rank)
 *   GET /api/ranking/trips?from&to → Trip[] (FECHADA only, ajuste_manual applied)
 *   GET /api/ranking/blocks        → DriverBlockRecord[] (active)
 *   GET /api/ranking/route-scores  → RouteScoreRecord[]
 *   GET /api/ranking/stats         → RankingStats
 *
 * Eden Treaty bracket-notation (`(api.api.ranking as any)['route-scores']`)
 * required because the `route-scores` segment contains a hyphen — TS
 * dot-notation disallows `-`. Cast `as any` matches the established pattern in
 * useInsights (`(api.api.insights as any)['sla-history']`).
 *
 * READ-ONLY: no mutation hooks (POST/PATCH/DELETE) — write is Phase 9.
 *
 * @see api/src/modules/ranking/ranking.plugin.ts — endpoint contracts
 * @see api/src/modules/ranking/ranking.service.ts — RankedDriver / RankingStats
 */

// Re-export the Phase 7 contract types so the abas consume them without
// redefinition (same relative-path style as torre-de-controle/src/types/api.ts).
export type { RankedDriver, RankingStats } from '../../../api/src/modules/ranking/ranking.service'
export type {
  Driver,
  Trip,
  DriverBlockRecord,
  RouteScoreRecord,
  StatusMetrics,
} from '../../../api/src/modules/ranking/ranking.types'

import type { RankedDriver, RankingStats } from '../../../api/src/modules/ranking/ranking.service'
import type {
  Trip,
  DriverBlockRecord,
  RouteScoreRecord,
} from '../../../api/src/modules/ranking/ranking.types'

/** GET /api/ranking/drivers — full driver array (ATIVO + BLOQUEADO), pontuacao desc. */
export function useRankingDrivers() {
  const q = useQuery({
    queryKey: ['ranking', 'drivers'],
    queryFn: async (): Promise<RankedDriver[]> => {
      const { data, error } = await api.api.ranking.drivers.get()
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch ranking drivers')
      return (data ?? []) as RankedDriver[]
    },
    staleTime: 30_000,
  })
  return {
    data:      q.data ?? ([] as RankedDriver[]),
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

/** GET /api/ranking/trips — FECHADA trips only, optional from/to BR-date filter. */
export function useRankingTrips(filters?: { from?: string; to?: string }) {
  const q = useQuery({
    queryKey: ['ranking', 'trips', filters],
    queryFn: async (): Promise<Trip[]> => {
      const { data, error } = await api.api.ranking.trips.get({ query: (filters ?? {}) as any })
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch ranking trips')
      // Eden Treaty revives ISO-8601 `data` values into Date objects (rows whose
      // date is BR-format "dd/MM/yyyy HH:mm:ss" stay strings). Normalize to a
      // display string so no consumer renders a raw Date — which throws "Objects
      // are not valid as a React child" and crashes the whole RankingPage via the
      // router ErrorBoundary (hit by ViagensTab pagination + DriverDetailsDialog).
      return ((data ?? []) as Trip[]).map((t) => {
        const d = t.data as unknown
        return d instanceof Date ? { ...t, data: formatDate(d, 'dd/MM/yyyy HH:mm:ss') } : t
      })
    },
    staleTime: 30_000,
  })
  return {
    data:      q.data ?? ([] as Trip[]),
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

/** GET /api/ranking/blocks — active driver blocks only. */
export function useRankingBlocks() {
  const q = useQuery({
    queryKey: ['ranking', 'blocks'],
    queryFn: async (): Promise<DriverBlockRecord[]> => {
      const { data, error } = await api.api.ranking.blocks.get()
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch ranking blocks')
      return (data ?? []) as DriverBlockRecord[]
    },
    staleTime: 30_000,
  })
  return {
    data:      q.data ?? ([] as DriverBlockRecord[]),
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

/** GET /api/ranking/route-scores — all route base scores (bracket-notation: hyphen). */
export function useRankingRouteScores() {
  const q = useQuery({
    queryKey: ['ranking', 'route-scores'],
    queryFn: async (): Promise<RouteScoreRecord[]> => {
      const { data, error } = await (api.api.ranking as any)['route-scores'].get()
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch ranking route-scores')
      return (data ?? []) as RouteScoreRecord[]
    },
    staleTime: 30_000,
  })
  return {
    data:      q.data ?? ([] as RouteScoreRecord[]),
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

/** GET /api/ranking/stats — { activeDrivers, top3Avg, totalTrips, activeBlocks }. */
export function useRankingStats() {
  const q = useQuery({
    queryKey: ['ranking', 'stats'],
    queryFn: async (): Promise<RankingStats> => {
      const { data, error } = await api.api.ranking.stats.get()
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch ranking stats')
      return (data ?? { activeDrivers: 0, top3Avg: 0, totalTrips: 0, activeBlocks: 0 }) as RankingStats
    },
    staleTime: 30_000,
  })
  return {
    data:      q.data ?? ({ activeDrivers: 0, top3Avg: 0, totalTrips: 0, activeBlocks: 0 } as RankingStats),
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}
