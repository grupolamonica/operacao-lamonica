import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { heartbeat, listOnlineOperators, getOperatorTickets } from './operators.service'

export const operatorsPlugin = new Elysia({ name: 'operators' })
  .use(authGuard)
  .group('/api/operators', (app) =>
    app
      .post('/heartbeat', ({ user }) => heartbeat(user.id), {
        detail: { tags: ['operators'], summary: 'Marca presença do operador (heartbeat)' },
      })
      .get('/online', () => listOnlineOperators(), {
        detail: { tags: ['operators'], summary: 'Operadores online (Fila de Operadores)' },
      })
      .get('/:id/tickets', ({ params }) => getOperatorTickets(params.id), {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        detail: { tags: ['operators'], summary: 'Tickets ativos que o operador está tratando' },
      }),
  )
