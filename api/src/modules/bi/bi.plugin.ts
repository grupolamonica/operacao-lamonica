import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getExecutiveKpis, getBreakdown, getTrendSeries } from './bi.service'

const period    = t.Union([t.Literal('today'), t.Literal('7d'), t.Literal('30d'), t.Literal('90d')])
const dimension = t.Union([t.Literal('client'), t.Literal('driver'), t.Literal('region'), t.Literal('route')])
const metric    = t.Union([t.Literal('deliveries'), t.Literal('sla_pct'), t.Literal('alerts'), t.Literal('delay_avg')])

export const biPlugin = new Elysia({ name: 'bi' })
  .use(authGuard)
  .group('/api/bi', (app) =>
    app
      .get('/kpis', ({ query }) => getExecutiveKpis(query.period ?? '30d', query.clientId), {
        query: t.Object({
          period:   t.Optional(period),
          clientId: t.Optional(t.String({ format: 'uuid' })),
        }),
        detail: { tags: ['bi'], summary: 'Executive KPI overview' },
      })
      .get('/breakdown', ({ query }) => getBreakdown(query.dimension ?? 'client', query.period ?? '30d', query.clientId), {
        query: t.Object({
          dimension: t.Optional(dimension),
          period:    t.Optional(period),
          clientId:  t.Optional(t.String({ format: 'uuid' })),
        }),
        detail: { tags: ['bi'], summary: 'Per-dimension breakdown' },
      })
      .get('/trend', ({ query }) => getTrendSeries(query.metric ?? 'deliveries', query.period ?? '30d', query.clientId), {
        query: t.Object({
          metric:   t.Optional(metric),
          period:   t.Optional(period),
          clientId: t.Optional(t.String({ format: 'uuid' })),
        }),
        detail: { tags: ['bi'], summary: 'Time-series for a metric' },
      })
  )
