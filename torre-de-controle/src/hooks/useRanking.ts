import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/formatters'
import { useAuthStore } from '@/stores/useAuthStore'

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
 * Phase 9 write layer (this file):
 *   POST   /api/ranking/evaluations     → useEvaluateTrip
 *   POST   /api/ranking/blocks          → useBlockDriver
 *   PATCH  /api/ranking/blocks/:id      → useUnblockDriver
 *   POST   /api/ranking/route-scores    → useCreateRouteScore
 *   PATCH  /api/ranking/route-scores/:id→ useUpdateRouteScore
 *   DELETE /api/ranking/route-scores/:id→ useDeleteRouteScore
 *   GET    /api/ranking/logs            → useRankingLogs
 *   Role gate for write UI              → useCanWriteRanking (admin|supervisor only)
 *
 * SECURITY NOTE (T-09-19): useCanWriteRanking is convenience only — it hides/disables
 * controls. The real gate is requireRole('admin','supervisor') on the backend (09-03/04).
 * A user bypassing the frontend still gets 403.
 *
 * Mutation invalidation (D-09-09): each write invalidates the relevant ['ranking', ...]
 * keys so the derived ranking refetches (backend already busted the 60s Redis cache).
 *
 * @see api/src/modules/ranking/ranking.plugin.ts — endpoint contracts (read)
 * @see api/src/modules/ranking/ranking.write.plugin.ts — endpoint contracts (write)
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
  EvaluationRecord,
  EvaluationLogRecord,
  Comunicacao,
  DesvioRota,
  Postura,
} from '../../../api/src/modules/ranking/ranking.types'

import type { RankedDriver, RankingStats } from '../../../api/src/modules/ranking/ranking.service'
import type {
  Trip,
  DriverBlockRecord,
  RouteScoreRecord,
  EvaluationRecord,
  EvaluationLogRecord,
  Comunicacao,
  DesvioRota,
  Postura,
} from '../../../api/src/modules/ranking/ranking.types'

/** Filter overrides driven by the ranking filter bar. `ignoredOccurrences`
 *  rescoring + `from`/`to` date range are applied server-side (composeRanking). */
export interface RankingFilterOpts {
  ignoredOccurrences?: string[]
  from?: string
  to?: string
}

/** Build the query object for the composed endpoints. `ignored` is JSON-encoded
 *  (occurrence descriptions contain commas). */
function buildRankingQuery(opts?: RankingFilterOpts): Record<string, string> {
  const q: Record<string, string> = {}
  if (opts?.ignoredOccurrences) q.ignored = JSON.stringify(opts.ignoredOccurrences)
  if (opts?.from) q.from = opts.from
  if (opts?.to) q.to = opts.to
  return q
}

/** GET /api/ranking/drivers — full driver array (ATIVO + BLOQUEADO), pontuacao desc. */
export function useRankingDrivers(opts?: RankingFilterOpts) {
  const q = useQuery({
    queryKey: ['ranking', 'drivers', opts ?? {}],
    queryFn: async (): Promise<RankedDriver[]> => {
      const { data, error } = await api.api.ranking.drivers.get({ query: buildRankingQuery(opts) as any })
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
export function useRankingTrips(opts?: RankingFilterOpts) {
  const q = useQuery({
    queryKey: ['ranking', 'trips', opts ?? {}],
    queryFn: async (): Promise<Trip[]> => {
      const { data, error } = await api.api.ranking.trips.get({ query: buildRankingQuery(opts) as any })
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch ranking trips')
      // Eden Treaty revives ISO-8601 strings into Date objects PER VALUE — so any
      // trip field whose value happens to be ISO (data, eta_*_scheduled/realized)
      // arrives as a Date while BR-format values stay strings. Rendering a raw Date
      // throws "Objects are not valid as a React child" and crashes the whole
      // RankingPage via the router ErrorBoundary (hit by ViagensTab + the
      // DriverDetailsDialog trip accordion). Coerce EVERY Date field to a display
      // string defensively (clone only when a Date is found).
      return ((data ?? []) as Trip[]).map((t) => {
        let out: Record<string, unknown> | null = null
        for (const key in t) {
          const v = (t as Record<string, unknown>)[key]
          if (v instanceof Date) {
            out = out ?? { ...t }
            out[key] = formatDate(v, 'dd/MM/yyyy HH:mm:ss')
          }
        }
        return (out ?? t) as Trip
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
export function useRankingStats(opts?: RankingFilterOpts) {
  const q = useQuery({
    queryKey: ['ranking', 'stats', opts ?? {}],
    queryFn: async (): Promise<RankingStats> => {
      const { data, error } = await api.api.ranking.stats.get({ query: buildRankingQuery(opts) as any })
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

// =============================================================================
// Phase 9 additions: audit log read + mutation hooks + role gate
// =============================================================================

/** GET /api/ranking/logs — full evaluation audit log for the LogsTab. */
export function useRankingLogs() {
  const q = useQuery({
    queryKey: ['ranking', 'logs'],
    queryFn: async (): Promise<EvaluationLogRecord[]> => {
      const { data, error } = await (api.api.ranking as any).logs.get()
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch ranking logs')
      return (data ?? []) as EvaluationLogRecord[]
    },
    staleTime: 30_000,
  })
  return {
    data:      q.data ?? ([] as EvaluationLogRecord[]),
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

/** GET /api/ranking/evaluations — all operator evaluations (read-only). Feeds the
 *  DriverDetailsDialog quality summary + "Análise da Lamônica". */
export function useRankingEvaluations() {
  const q = useQuery({
    queryKey: ['ranking', 'evaluations'],
    queryFn: async (): Promise<EvaluationRecord[]> => {
      const { data, error } = await (api.api.ranking as any).evaluations.get()
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch ranking evaluations')
      return (data ?? []) as EvaluationRecord[]
    },
    staleTime: 30_000,
  })
  return {
    data:      q.data ?? ([] as EvaluationRecord[]),
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

/**
 * Role gate for the write UI (D-09-10).
 * Returns true only for admin|supervisor — these are the same roles that pass
 * requireRole('admin','supervisor') on the backend (T-09-19 defense-in-depth).
 * This only hides/disables UI controls; the real authorization is server-side.
 */
export function useCanWriteRanking(): boolean {
  const role = useAuthStore(s => s.user?.role)
  return role === 'admin' || role === 'supervisor'
}

// ---------------------------------------------------------------------------
// Payload input types for mutation hooks (matching backend typebox schemas)
// ---------------------------------------------------------------------------

export interface EvaluateTripInput {
  trip_id:      string
  driver_id:    string
  driver_name:  string
  comunicacao:  Comunicacao
  atendeu:      boolean
  desvio_rota:  DesvioRota
  postura:      Postura
  ajuste_manual: number  // integer, clamped [-20,20] by backend
  observacao?:  string
}

export interface BlockDriverInput {
  driver_id:   string
  driver_name: string
  motivo:      string
}

export interface UnblockDriverInput {
  id:          string  // block row id — REST semantics; actual unblock keys on driver_id+ativo
  driver_id:   string
  driver_name: string
}

export interface RouteScoreCreateInput {
  origin_code:      string
  destination_code: string
  pontuacao:        number
  data_inicio:      string
  data_fim:         string | null
  observacao:       string | null
}

export interface RouteScoreUpdateInput {
  id:               string
  origin_code?:     string
  destination_code?: string
  pontuacao?:       number
  data_inicio?:     string
  data_fim?:        string | null
  observacao?:      string | null
}

// ---------------------------------------------------------------------------
// Mutation hooks — each invalidates relevant ['ranking', ...] keys (D-09-09)
// Backend already busts the 60s Redis cache; the front must refetch to stay fresh.
// All calls go through the requireRole('admin','supervisor')-gated Phase 9 endpoints.
// ---------------------------------------------------------------------------

/**
 * POST /api/ranking/evaluations — upsert trip evaluation + optional NO_SHOW auto-block.
 * Invalidates: trips, drivers, stats, blocks (block may be auto-created), logs.
 */
export function useEvaluateTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: EvaluateTripInput) => {
      const { data, error } = await api.api.ranking.evaluations.post(payload as any)
      if (error) throw new Error((error.value as any)?.error ?? 'Falha na operação')
      return data
    },
    onSuccess: () => {
      ;(['trips', 'drivers', 'stats', 'blocks', 'logs'] as const).forEach(key =>
        qc.invalidateQueries({ queryKey: ['ranking', key] })
      )
    },
  })
}

/**
 * POST /api/ranking/drivers/import — upsert drivers (CSV/xlsx) + IMPORT_MOTORISTAS audit.
 * Names override the trip-sheet names for matching driver_ids (re-derives ranking).
 * Invalidates: drivers, trips, logs.
 */
export function useImportDrivers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (drivers: { driver_id: string; driver_name: string }[]) => {
      const { data, error } = await (api.api.ranking as any).drivers.import.post({ drivers })
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao importar motoristas')
      return data as { ok: boolean; count: number }
    },
    onSuccess: () => {
      ;(['drivers', 'trips', 'logs'] as const).forEach(key =>
        qc.invalidateQueries({ queryKey: ['ranking', key] })
      )
    },
  })
}

/**
 * POST /api/ranking/blocks — manual driver block + BLOQUEIO_MANUAL audit.
 * Invalidates: blocks, drivers, stats, logs.
 */
export function useBlockDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: BlockDriverInput) => {
      const { data, error } = await api.api.ranking.blocks.post(payload as any)
      if (error) throw new Error((error.value as any)?.error ?? 'Falha na operação')
      return data
    },
    onSuccess: () => {
      ;(['blocks', 'drivers', 'stats', 'logs'] as const).forEach(key =>
        qc.invalidateQueries({ queryKey: ['ranking', key] })
      )
    },
  })
}

/**
 * PATCH /api/ranking/blocks/:id — unblock driver (closes active rows + override record) + DESBLOQUEIO audit.
 * Bracket-cast not needed (no hyphen); path param via dynamic call form.
 * Invalidates: blocks, drivers, stats, logs.
 */
export function useUnblockDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, driver_id, driver_name }: UnblockDriverInput) => {
      const { data, error } = await (api.api.ranking.blocks as any)({ id }).patch({ driver_id, driver_name })
      if (error) throw new Error((error.value as any)?.error ?? 'Falha na operação')
      return data
    },
    onSuccess: () => {
      ;(['blocks', 'drivers', 'stats', 'logs'] as const).forEach(key =>
        qc.invalidateQueries({ queryKey: ['ranking', key] })
      )
    },
  })
}

/**
 * POST /api/ranking/route-scores — create route base score + ROTA_CRIACAO audit + cache bust.
 * Bracket-cast required: hyphen in 'route-scores' breaks TS dot-access (mirror of useRankingRouteScores).
 * Invalidates: route-scores, trips, drivers, stats, logs (base points change derived scores).
 */
export function useCreateRouteScore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: RouteScoreCreateInput) => {
      const { data, error } = await (api.api.ranking as any)['route-scores'].post(payload)
      if (error) throw new Error((error.value as any)?.error ?? 'Falha na operação')
      return data
    },
    onSuccess: () => {
      ;(['route-scores', 'trips', 'drivers', 'stats', 'logs'] as const).forEach(key =>
        qc.invalidateQueries({ queryKey: ['ranking', key] })
      )
    },
  })
}

/**
 * PATCH /api/ranking/route-scores/:id — update route score + ROTA_EDICAO audit + cache bust.
 * Bracket-cast + path-param call form (mirror of blocks/:id pattern above).
 * Invalidates: route-scores, trips, drivers, stats, logs.
 */
export function useUpdateRouteScore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: RouteScoreUpdateInput) => {
      const { data, error } = await (api.api.ranking as any)['route-scores']({ id }).patch(patch)
      if (error) throw new Error((error.value as any)?.error ?? 'Falha na operação')
      return data
    },
    onSuccess: () => {
      ;(['route-scores', 'trips', 'drivers', 'stats', 'logs'] as const).forEach(key =>
        qc.invalidateQueries({ queryKey: ['ranking', key] })
      )
    },
  })
}

/**
 * DELETE /api/ranking/route-scores/:id — remove route score + ROTA_REMOCAO audit + cache bust.
 * Bracket-cast + path-param call form.
 * Invalidates: route-scores, trips, drivers, stats, logs.
 */
export function useDeleteRouteScore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (api.api.ranking as any)['route-scores']({ id }).delete()
      if (error) throw new Error((error.value as any)?.error ?? 'Falha na operação')
      return data
    },
    onSuccess: () => {
      ;(['route-scores', 'trips', 'drivers', 'stats', 'logs'] as const).forEach(key =>
        qc.invalidateQueries({ queryKey: ['ranking', key] })
      )
    },
  })
}
