/**
 * Ranking HTTP plugin — 5 read-only GET endpoints behind the Torre `authGuard`.
 *
 * D-V2-01 (PROXY): this plugin is the single authorization boundary for the
 * ride-rank data. `.use(authGuard)` requires a valid Torre auth-cookie (JWT +
 * Redis blacklist check) — an unauthenticated request gets 401 (T-07-09), so no
 * query ever reaches the ride-rank Supabase without a session.
 *
 * The 5 endpoints mirror the fixed response contract consumed by the Phase 8
 * front-end via Eden Treaty:
 *   GET /api/ranking/drivers       → RankedDriver[] (full array, status + rank)
 *   GET /api/ranking/trips         → Trip[] (FECHADA only, optional from/to)
 *   GET /api/ranking/blocks        → DriverBlockRecord[] (active)
 *   GET /api/ranking/route-scores  → RouteScoreRecord[]
 *   GET /api/ranking/stats         → { activeDrivers, top3Avg, totalTrips, activeBlocks }
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
  getRankingRouteScores,
  getRankingStats,
  getRankingTrips,
} from './ranking.service'

export const rankingPlugin = new Elysia({ name: 'ranking' })
  .use(authGuard)
  .group('/api/ranking', (app) =>
    app
      .get('/drivers', () => getRankingDrivers(), {
        detail: {
          tags: ['ranking'],
          summary: 'Ranking de motoristas — array completo (status + rank), pontuacao desc',
        },
      })
      .get('/trips', ({ query }) => getRankingTrips({ from: query.from, to: query.to }), {
        query: t.Object({
          from: t.Optional(t.String()),
          to: t.Optional(t.String()),
        }),
        detail: {
          tags: ['ranking'],
          summary: 'Viagens FECHADA (ajuste_manual aplicado), filtro opcional from/to',
        },
      })
      .get('/blocks', () => getRankingBlocks(), {
        detail: { tags: ['ranking'], summary: 'Bloqueios de motorista ativos' },
      })
      .get('/route-scores', () => getRankingRouteScores(), {
        detail: { tags: ['ranking'], summary: 'Pontuacoes base por rota' },
      })
      .get('/stats', () => getRankingStats(), {
        detail: {
          tags: ['ranking'],
          summary: 'Metricas: activeDrivers, top3Avg, totalTrips, activeBlocks',
        },
      })
  )
