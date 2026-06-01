/**
 * Ranking HTTP plugin — 6 read-only GET endpoints behind the Torre `authGuard`.
 *
 * D-V2-01 (PROXY): this plugin is the single authorization boundary for the
 * ride-rank data. `.use(authGuard)` requires a valid Torre auth-cookie (JWT +
 * Redis blacklist check) — an unauthenticated request gets 401 (T-07-09), so no
 * query ever reaches the ride-rank Supabase without a session.
 *
 * The 6 endpoints mirror the fixed response contract consumed by the Phase 8
 * front-end via Eden Treaty:
 *   GET /api/ranking/drivers       → RankedDriver[] (full array, status + rank)
 *   GET /api/ranking/trips         → Trip[] (FECHADA only, optional from/to)
 *   GET /api/ranking/blocks        → DriverBlockRecord[] (active)
 *   GET /api/ranking/route-scores  → RouteScoreRecord[]
 *   GET /api/ranking/stats         → { activeDrivers, top3Avg, totalTrips, activeBlocks }
 *   GET /api/ranking/logs          → EvaluationLogRecord[] (evaluation_logs, desc, limit 200)
 *                                    read-only auditoria added in Phase 9; lives on this READ
 *                                    plugin (not the write plugin) because it is a pure read
 *                                    under authGuard only — D-09-01: any authenticated role
 *                                    audits; no requireRole gate needed. (T-09-09)
 *
 * Errors thrown by the service (e.g. the lazy fail-fast when RANK_* envs are
 * missing, or a Supabase/Sheets fetch failure) propagate to the global
 * `onError` in index.ts, which masks 500s and never leaks the service_role
 * (T-07-11).
 *
 * `authGuard` is applied ONCE at the plugin level (same pattern as
 * dashboard.plugin) — it does NOT need to be repeated per route.
 */

import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import {
  getRankingBlocks,
  getRankingDrivers,
  getRankingEvaluations,
  getRankingLogs,
  getRankingRouteScores,
  getRankingStats,
  getRankingTrips,
} from './ranking.service'

/** Shared query schema for the composed endpoints (drivers/trips/stats). `ignored`
 *  is a JSON-encoded string[] (occurrence descriptions contain commas, so CSV is
 *  unsafe). `from`/`to` are BR-date strings. All optional. */
const rankingQuerySchema = t.Object({
  ignored: t.Optional(t.String()),
  from: t.Optional(t.String()),
  to: t.Optional(t.String()),
})

/** Parse the filter-bar query into RankingQueryOpts. `ignored` absent → undefined
 *  (backend keeps DEFAULT_IGNORED_OCCURRENCES); malformed JSON is ignored. */
function parseRankingQuery(query: { ignored?: string; from?: string; to?: string }) {
  let ignoredOccurrences: string[] | undefined
  if (query.ignored) {
    try {
      const parsed = JSON.parse(query.ignored)
      if (Array.isArray(parsed)) ignoredOccurrences = parsed.map(String)
    } catch {
      /* malformed — fall back to default ignore set */
    }
  }
  const dateRange = query.from || query.to ? { from: query.from, to: query.to } : undefined
  return { ignoredOccurrences, dateRange }
}

export const rankingPlugin = new Elysia({ name: 'ranking' })
  .use(authGuard)
  .group('/api/ranking', (app) =>
    app
      .get('/drivers', ({ query }) => getRankingDrivers(parseRankingQuery(query)), {
        query: rankingQuerySchema,
        detail: {
          tags: ['ranking'],
          summary: 'Ranking de motoristas (status + rank, pontuacao desc); filtros opcionais ignored/from/to',
        },
      })
      .get('/trips', ({ query }) => getRankingTrips(parseRankingQuery(query)), {
        query: rankingQuerySchema,
        detail: {
          tags: ['ranking'],
          summary: 'Viagens FECHADA (ajuste_manual aplicado); filtros opcionais ignored/from/to',
        },
      })
      .get('/blocks', () => getRankingBlocks(), {
        detail: { tags: ['ranking'], summary: 'Bloqueios de motorista ativos' },
      })
      .get('/route-scores', () => getRankingRouteScores(), {
        detail: { tags: ['ranking'], summary: 'Pontuacoes base por rota' },
      })
      .get('/stats', ({ query }) => getRankingStats(parseRankingQuery(query)), {
        query: rankingQuerySchema,
        detail: {
          tags: ['ranking'],
          summary: 'Metricas: activeDrivers, top3Avg, totalTrips, activeBlocks; filtros opcionais ignored/from/to',
        },
      })
      .get('/logs', () => getRankingLogs(), {
        detail: {
          tags: ['ranking'],
          summary: 'Log de auditoria (evaluation_logs), ordenado desc',
        },
      })
      .get('/evaluations', () => getRankingEvaluations(), {
        detail: {
          tags: ['ranking'],
          summary: 'Avaliações de operador (read-only) — resumo de qualidade do modal',
        },
      })
  )
