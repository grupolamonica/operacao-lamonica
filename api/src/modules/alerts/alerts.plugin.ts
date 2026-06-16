import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { listAlerts, getAlertById, assignAlert, assignAlertsBulk, addTreatment, resolveAlert, getAlertStats, createAlert } from './alerts.service'
import {
  transitionAlert, addComment, setAlertPriority, assignAlertTo, listAlertHistory,
  WorkflowError, ALERT_STATUSES,
} from './alerts.workflow'

const severity     = t.Union([t.Literal('critico'), t.Literal('medio'), t.Literal('baixo')])
// Sprint 2: extended status machine (legacy values still accepted)
const alertStatus  = t.Union(ALERT_STATUSES.map((s) => t.Literal(s)))
const priority     = t.Union([t.Literal('alta'), t.Literal('media'), t.Literal('baixa')])

export const alertsPlugin = new Elysia({ name: 'alerts' })
  .use(authGuard)
  .group('/api/alerts', (app) =>
    app
      .get('/stats', () => getAlertStats(), { detail: { tags: ['alerts'], summary: 'KPIAlertas' } })
      // Phase 12 (D-12-29) — abrir ocorrência manual a partir de uma viagem
      .post('/', async ({ body }) => createAlert(body), {
        body: t.Object({
          type:        t.String({ minLength: 1, maxLength: 50 }),
          severity,
          title:       t.String({ minLength: 1, maxLength: 150 }),
          description: t.Optional(t.String({ maxLength: 2000 })),
          tripId:      t.Optional(t.String({ format: 'uuid' })),
          driverId:    t.Optional(t.String({ format: 'uuid' })),
          priority:    t.Optional(priority),
        }),
        detail: { tags: ['alerts'], summary: 'Create a manual alert (operator)' },
      })
      .get('/', ({ query }) => listAlerts({
        severity:   query.severity,
        status:     query.status,
        type:       query.type,
        clientName: query.clientName,
        routeCode:  query.routeCode,
        assignedTo: query.assignedTo,
        inicio:     query.inicio,
        fim:        query.fim,
        search:     query.search,
      }), {
        query: t.Object({
          severity:   t.Optional(severity),
          status:     t.Optional(alertStatus),
          type:       t.Optional(t.String()),
          clientName: t.Optional(t.String()),
          routeCode:  t.Optional(t.String()),
          assignedTo: t.Optional(t.String({ format: 'uuid' })),
          inicio:     t.Optional(t.String()),
          fim:        t.Optional(t.String()),
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
      // Uma ocorrência por id — p/ deep-link (auditoria/sino/dashboard) abrir tickets
      // fora do teto de 500 do list. Mesmo enriquecimento (getAlertById reusa listAlerts).
      .get('/:id', async ({ params, set }) => {
        const a = await getAlertById(params.id)
        if (!a) { set.status = 404; return { error: 'Alert not found' } }
        return a
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        detail: { tags: ['alerts'], summary: 'Get one alert by id' },
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
      // Assumir TODAS as ocorrências abertas de uma viagem (D-14) — bulk pro operador corrente.
      .post('/assign-bulk', async ({ body, user }) => {
        return assignAlertsBulk(body.ids, user.id)
      }, {
        body: t.Object({ ids: t.Array(t.String({ format: 'uuid' }), { minItems: 1 }) }),
        detail: { tags: ['alerts'], summary: 'Assumir várias ocorrências (viagem inteira) p/ o usuário corrente' },
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
