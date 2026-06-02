import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getSlaDashboard, listSlaRules, evaluateAllActiveTrips, evaluateTripSla } from './sla.service'

const period = t.Union([t.Literal('today'), t.Literal('7d'), t.Literal('30d')])

export const slaPlugin = new Elysia({ name: 'sla' })
  .use(authGuard)
  .group('/api/sla', (app) =>
    app
      .get('/dashboard', ({ query }) => getSlaDashboard(query.period ?? '7d'), {
        query:  t.Object({ period: t.Optional(period) }),
        detail: { tags: ['sla'], summary: 'SLA dashboard — pct + per-client breakdown + live counts' },
      })
      .get('/rules', () => listSlaRules(), {
        detail: { tags: ['sla'], summary: 'List SLA rules' },
      })
      .post('/evaluate-all', () => evaluateAllActiveTrips(), {
        detail: { tags: ['sla'], summary: 'Bulk evaluate active trips (creates alerts on risk/breach)' },
      })
      .get('/trip/:id', async ({ params, set }) => {
        const r = await evaluateTripSla(params.id)
        if (!r) { set.status = 404; return { error: 'Trip not found' } }
        return r
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        detail: { tags: ['sla'], summary: 'Live SLA evaluation for a single trip' },
      })
  )
