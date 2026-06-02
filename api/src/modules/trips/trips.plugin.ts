import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { listTrips, getTripById, getTripStats } from './trips.service'
import { getTripTimeline } from './timeline.service'

const tripStatus = t.Union([t.Literal('planned'), t.Literal('in_progress'), t.Literal('completed'), t.Literal('delayed'), t.Literal('cancelled')])
const slaStatus  = t.Union([t.Literal('no_prazo'), t.Literal('em_risco'), t.Literal('atrasado'), t.Literal('sem_sinal')])
const priority   = t.Union([t.Literal('alta'), t.Literal('media'), t.Literal('baixa')])

export const tripsPlugin = new Elysia({ name: 'trips' })
  .use(authGuard)
  .group('/api/trips', (app) =>
    app
      .get('/stats', () => getTripStats(), { detail: { tags: ['trips'], summary: 'KPIViagens aggregate' } })
      .get('/', ({ query }) => listTrips(
        {
          status:     query.status,
          slaStatus:  query.slaStatus,
          clientName: query.clientName,
          driverName: query.driverName,
          priority:   query.priority,
          routeCode:  query.routeCode,
          search:     query.search,
        },
        query.page  ?? 0,
        query.limit ?? 100,
      ), {
        query: t.Object({
          status:     t.Optional(tripStatus),
          slaStatus:  t.Optional(slaStatus),
          clientName: t.Optional(t.String()),
          driverName: t.Optional(t.String()),
          priority:   t.Optional(priority),
          routeCode:  t.Optional(t.String()),
          search:     t.Optional(t.String()),
          page:       t.Optional(t.Numeric({ minimum: 0 })),
          limit:      t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
        }),
        detail: { tags: ['trips'], summary: 'List trips with filters' },
      })
      .get('/:id', async ({ params, set }) => {
        const trip = await getTripById(params.id)
        if (!trip) { set.status = 404; return { error: 'Trip not found' } }
        return trip
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        detail: { tags: ['trips'], summary: 'Get trip by id' },
      })
      .get('/:id/timeline', async ({ params, set }) => {
        const trip = await getTripById(params.id)
        if (!trip) { set.status = 404; return { error: 'Trip not found' } }
        return getTripTimeline(params.id)
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        detail: { tags: ['trips'], summary: 'Unified timeline (events + alerts + treatments)' },
      })
  )
