import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import {
  getSlaHistory,
  getDriversRanking,
  getProblematicRoutes,
  getAlertsDistribution,
} from './insights.service'

/**
 * Insights API plugin — 4 read-only endpoints under /api/insights/* protected
 * by authGuard (any authenticated role). Cada endpoint aceita um intervalo de
 * datas "Prazo Final" (inicio/fim, 'YYYY-MM-DD', ambos opcionais) que corta por
 * trips.window_end (e occurred_at nos alertas). Sem datas = sem corte (tudo).
 *
 * The plugin is registered in api/src/index.ts during Wave 1 plan 06-04 wiring.
 *
 * @see CONTEXT D-01..D-05 (Insights metrics + cross-filter)
 * @see RESEARCH lines 180-194 (endpoint contracts)
 */

export const insightsPlugin = new Elysia({ name: 'insights' })
  .use(authGuard)
  .group('/api/insights', (app) =>
    app
      .get(
        '/sla-history',
        ({ query }) => getSlaHistory({ inicio: query.inicio, fim: query.fim }),
        {
          query: t.Object({
            inicio: t.Optional(t.String()),
            fim: t.Optional(t.String()),
          }),
          detail: {
            tags: ['insights'],
            summary: 'SLA percentage aggregated by completion day',
          },
        },
      )
      .get(
        '/drivers-ranking',
        ({ query }) => getDriversRanking({ inicio: query.inicio, fim: query.fim }, query.limit ?? 10),
        {
          query: t.Object({
            inicio: t.Optional(t.String()),
            fim: t.Optional(t.String()),
            limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
          }),
          detail: {
            tags: ['insights'],
            summary: 'Top N drivers ranked by operational score + SLA',
          },
        },
      )
      .get(
        '/problematic-routes',
        ({ query }) => getProblematicRoutes({ inicio: query.inicio, fim: query.fim }),
        {
          query: t.Object({
            inicio: t.Optional(t.String()),
            fim: t.Optional(t.String()),
          }),
          detail: {
            tags: ['insights'],
            summary: 'Routes ordered by alert count over the range',
          },
        },
      )
      .get(
        '/alerts-distribution',
        ({ query }) => getAlertsDistribution({ inicio: query.inicio, fim: query.fim }),
        {
          query: t.Object({
            inicio: t.Optional(t.String()),
            fim: t.Optional(t.String()),
          }),
          detail: {
            tags: ['insights'],
            summary: 'Alerts grouped by type over the range',
          },
        },
      ),
  )
