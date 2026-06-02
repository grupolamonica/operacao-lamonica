import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { forecastDemand, forecastRegions, forecastDelayRisk } from './forecast.service'

const dimension = t.Union([t.Literal('total'), t.Literal('client'), t.Literal('region')])

export const forecastPlugin = new Elysia({ name: 'forecast' })
  .use(authGuard)
  .group('/api/forecast', (app) =>
    app
      .get('/demand', ({ query }) => forecastDemand({
        lookbackDays: query.lookback,
        horizonDays:  query.horizon,
        dimension:    query.dimension,
      }), {
        query: t.Object({
          lookback:  t.Optional(t.Numeric({ minimum: 7, maximum: 180 })),
          horizon:   t.Optional(t.Numeric({ minimum: 1, maximum: 30 })),
          dimension: t.Optional(dimension),
        }),
        detail: { tags: ['forecast'], summary: 'Demand forecast (deliveries per day) with optional breakdown' },
      })
      .get('/regions', () => forecastRegions(), {
        detail: { tags: ['forecast'], summary: 'Top regions by projected 7d demand × current risk' },
      })
      .get('/delay-risk', () => forecastDelayRisk(), {
        detail: { tags: ['forecast'], summary: 'Next-24h delay/breach risk estimate' },
      })
  )
