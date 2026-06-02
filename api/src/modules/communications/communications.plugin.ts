import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { logCommunication, listCommunications, CommError } from './communications.service'

const channel   = t.Union([t.Literal('call'), t.Literal('sms'), t.Literal('whatsapp'), t.Literal('note')])
const direction = t.Union([t.Literal('out'), t.Literal('in')])
const outcome   = t.Union([t.Literal('atendida'), t.Literal('nao_atendida'), t.Literal('caixa_postal'), t.Literal('enviada'), t.Literal('recebida')])

export const communicationsPlugin = new Elysia({ name: 'communications' })
  .use(authGuard)
  .group('/api/communications', (app) =>
    app
      .get('/', async ({ query, set }) => {
        try {
          return await listCommunications({
            driverId: query.driverId,
            tripId:   query.tripId,
            alertId:  query.alertId,
            limit:    query.limit,
          })
        } catch (e) {
          if (e instanceof CommError) { set.status = 400; return { error: e.message, code: e.code } }
          throw e
        }
      }, {
        query: t.Object({
          driverId: t.Optional(t.String({ format: 'uuid' })),
          tripId:   t.Optional(t.String({ format: 'uuid' })),
          alertId:  t.Optional(t.String({ format: 'uuid' })),
          limit:    t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
        }),
        detail: { tags: ['communications'], summary: 'List communications by scope' },
      })
      .post('/', async ({ body, user, set }) => {
        try {
          return await logCommunication({ ...body, operatorId: user.id })
        } catch (e) {
          if (e instanceof CommError) { set.status = 400; return { error: e.message, code: e.code } }
          throw e
        }
      }, {
        body: t.Object({
          driverId:    t.Optional(t.String({ format: 'uuid' })),
          tripId:      t.Optional(t.String({ format: 'uuid' })),
          alertId:     t.Optional(t.String({ format: 'uuid' })),
          channel,
          direction:   t.Optional(direction),
          content:     t.Optional(t.String({ maxLength: 4000 })),
          durationSec: t.Optional(t.Numeric({ minimum: 0, maximum: 86400 })),
          outcome:     t.Optional(outcome),
        }),
        detail: { tags: ['communications'], summary: 'Log a call/sms/whatsapp/note' },
      })
  )
