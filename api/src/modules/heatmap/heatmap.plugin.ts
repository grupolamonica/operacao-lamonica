import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getHeatmap } from './heatmap.service'

const layer  = t.Union([t.Literal('alertas'), t.Literal('atrasos'), t.Literal('desvios'), t.Literal('paradas'), t.Literal('risco')])
const period = t.Union([t.Literal('today'), t.Literal('7d'), t.Literal('30d')])

export const heatmapPlugin = new Elysia({ name: 'heatmap' })
  .use(authGuard)
  .group('/api/heatmap', (app) =>
    app
      .get('/', ({ query }) => getHeatmap(query.layer ?? 'alertas', query.period ?? '7d'), {
        query: t.Object({
          layer:  t.Optional(layer),
          period: t.Optional(period),
        }),
        detail: { tags: ['heatmap'], summary: 'Geographic heatmap aggregation (alerts/risk by layer/period)' },
      })
  )
