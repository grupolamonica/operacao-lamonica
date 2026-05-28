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
 * by authGuard (any authenticated role). Each endpoint returns aggregated
 * analytics for a configurable range (7d / 30d / 90d).
 *
 * The plugin is registered in api/src/index.ts during Wave 1 plan 06-04 wiring.
 *
 * @see CONTEXT D-01..D-05 (Insights metrics + cross-filter)
 * @see RESEARCH lines 180-194 (endpoint contracts)
 */

const range = t.Union([t.Literal('7d'), t.Literal('30d'), t.Literal('90d')])

export const insightsPlugin = new Elysia({ name: 'insights' })
  .use(authGuard)
  .group('/api/insights', (app) =>
    app
      .get(
        '/sla-history',
        ({ query }) => getSlaHistory(query.range ?? '30d'),
        {
          query: t.Object({
            range: t.Optional(range),
          }),
          detail: {
            tags: ['insights'],
            summary: 'SLA percentage aggregated by completion day',
          },
        },
      )
      .get(
        '/drivers-ranking',
        ({ query }) => getDriversRanking(query.range ?? '30d', query.limit ?? 10),
        {
          query: t.Object({
            range: t.Optional(range),
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
        ({ query }) => getProblematicRoutes(query.range ?? '30d'),
        {
          query: t.Object({
            range: t.Optional(range),
          }),
          detail: {
            tags: ['insights'],
            summary: 'Routes ordered by alert count over the range',
          },
        },
      )
      .get(
        '/alerts-distribution',
        ({ query }) => getAlertsDistribution(query.range ?? '30d'),
        {
          query: t.Object({
            range: t.Optional(range),
          }),
          detail: {
            tags: ['insights'],
            summary: 'Alerts grouped by type over the range',
          },
        },
      ),
  )
