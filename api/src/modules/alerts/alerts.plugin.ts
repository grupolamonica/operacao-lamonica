import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { listAlerts, assignAlert, addTreatment, resolveAlert, getAlertStats } from './alerts.service'
import {
  transitionAlert, addComment, setAlertPriority, assignAlertTo, listAlertHistory,
  WorkflowError, ALERT_STATUSES,
} from './alerts.workflow'

const severity     = t.Union([t.Literal('critico'), t.Literal('medio'), t.Literal('baixo')])
// Sprint 2: extended status machine (legacy values still accepted)
const alertStatus  = t.Union(ALERT_STATUSES.map((s) => t.Literal(s)))
const priority     = t.Union([t.Literal('alta'), t.Literal('media'), t.Literal('baixa')])
const period       = t.Union([t.Literal('today'), t.Literal('7d'), t.Literal('30d')])

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
      .get('/:id/history', async ({ params, set }) => {
        const rows = await listAlertHistory(params.id)
        if (!rows) { set.status = 404; return { error: 'Alert not found' } }
        return rows
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        detail: { tags: ['alerts'], summary: 'Treatment/comment history for an alert' },
      })
      // Legacy assign — auto-attribuição ao usuário corrente. Continua existindo
      // para retrocompat com o frontend antigo que chama PATCH .../assign sem body.
      .patch('/:id/assign', async ({ params, user, set }) => {
        const r = await assignAlert(params.id, user.id)
        if (!r) { set.status = 404; return { error: 'Alert not found' } }
        return r
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        detail: { tags: ['alerts'], summary: 'Assign alert to current user (legacy)' },
      })
      // Atribuir a um usuário específico — Sprint 2
      .post('/:id/assign', async ({ params, body, user, set }) => {
        const r = await assignAlertTo({ alertId: params.id, userId: body.userId, currentUserId: user.id })
        if (!r) { set.status = 404; return { error: 'Alert not found' } }
        return r
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        body:   t.Object({ userId: t.String({ format: 'uuid' }) }),
        detail: { tags: ['alerts'], summary: 'Assign alert to a specific user' },
      })
      // Status transition (Nova→Análise→Tratativa→Resolvida→Encerrada)
      .post('/:id/transition', async ({ params, body, user, set }) => {
        try {
          return await transitionAlert({ alertId: params.id, to: body.to, userId: user.id, notes: body.notes })
        } catch (e) {
          if (e instanceof WorkflowError) {
            set.status = e.code === 'NOT_FOUND' ? 404 : 409
            return { error: e.message, code: e.code }
          }
          throw e
        }
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        body:   t.Object({ to: alertStatus, notes: t.Optional(t.String()) }),
        detail: { tags: ['alerts'], summary: 'Transition alert status (state machine)' },
      })
      // Comment thread
      .post('/:id/comment', async ({ params, body, user, set }) => {
        try {
          return await addComment({ alertId: params.id, userId: user.id, text: body.text })
        } catch (e) {
          if (e instanceof WorkflowError) { set.status = 404; return { error: e.message } }
          throw e
        }
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        body:   t.Object({ text: t.String({ minLength: 1, maxLength: 2000 }) }),
        detail: { tags: ['alerts'], summary: 'Add a comment to alert thread' },
      })
      // Set priority
      .patch('/:id/priority', async ({ params, body, set }) => {
        const r = await setAlertPriority({ alertId: params.id, priority: body.priority })
        if (!r) { set.status = 404; return { error: 'Alert not found' } }
        return r
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        body:   t.Object({ priority }),
        detail: { tags: ['alerts'], summary: 'Set alert priority' },
      })
      // Legacy treatment endpoint — kept for retrocompat
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
        detail: { tags: ['alerts'], summary: 'Add treatment record (legacy)' },
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
