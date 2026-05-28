import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { listAlerts, assignAlert, addTreatment, resolveAlert, getAlertStats } from './alerts.service'

const severity    = t.Union([t.Literal('critico'), t.Literal('medio'), t.Literal('baixo')])
const alertStatus = t.Union([t.Literal('aberto'), t.Literal('em_tratativa'), t.Literal('resolvido')])
const period      = t.Union([t.Literal('today'), t.Literal('7d'), t.Literal('30d')])

export const alertsPlugin = new Elysia({ name: 'alerts' })
  .use(authGuard)
  .group('/api/alerts', (app) =>
    app
      .get('/stats', () => getAlertStats(), { detail: { tags: ['alerts'], summary: 'KPIAlertas' } })
      .get('/', ({ query }) => listAlerts({
        severity:   query.severity,
        status:     query.status,
        type:       query.type,
        clientName: query.clientName,
        routeCode:  query.routeCode,
        assignedTo: query.assignedTo,
        period:     query.period,
        search:     query.search,
      }), {
        query: t.Object({
          severity:   t.Optional(severity),
          status:     t.Optional(alertStatus),
          type:       t.Optional(t.String()),
          clientName: t.Optional(t.String()),
          routeCode:  t.Optional(t.String()),
          assignedTo: t.Optional(t.String({ format: 'uuid' })),
          period:     t.Optional(period),
          search:     t.Optional(t.String()),
        }),
        detail: { tags: ['alerts'], summary: 'List alerts with filters' },
      })
      .patch('/:id/assign', async ({ params, user, set }) => {
        const r = await assignAlert(params.id, user.id)
        if (!r) { set.status = 404; return { error: 'Alert not found' } }
        return r
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        detail: { tags: ['alerts'], summary: 'Assign alert to current user' },
      })
      .post('/:id/treatments', async ({ params, body, user, set }) => {
        const r = await addTreatment(params.id, user.id, body)
        if (!r) { set.status = 404; return { error: 'Alert not found' } }
        return r
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        body: t.Object({
          actionType: t.Optional(t.String()),
          notes:      t.Optional(t.String()),
          outcome:    t.Optional(t.Union([t.Literal('pendente'), t.Literal('resolvido'), t.Literal('escalado')])),
        }),
        detail: { tags: ['alerts'], summary: 'Add treatment record' },
      })
      .patch('/:id/resolve', async ({ params, set }) => {
        const r = await resolveAlert(params.id)
        if (!r) { set.status = 404; return { error: 'Alert not found' } }
        return r
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        detail: { tags: ['alerts'], summary: 'Mark alert resolved' },
      })
  )
