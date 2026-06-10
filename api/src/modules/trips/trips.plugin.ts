import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { listTrips, getTripById, getTripStats, getTripRouteOptions, addTripNote } from './trips.service'
import { getTripTimeline } from './timeline.service'
import { getTripRisk, recalcTripRisk } from '../risk/risk.service'

const tripStatus = t.Union([t.Literal('planned'), t.Literal('in_progress'), t.Literal('completed'), t.Literal('delayed'), t.Literal('cancelled')])
const slaStatus  = t.Union([t.Literal('no_prazo'), t.Literal('em_risco'), t.Literal('atrasado'), t.Literal('sem_sinal')])
const priority   = t.Union([t.Literal('alta'), t.Literal('media'), t.Literal('baixa')])

export const tripsPlugin = new Elysia({ name: 'trips' })
  .use(authGuard)
  .group('/api/trips', (app) =>
    app
      .get('/stats', () => getTripStats(), { detail: { tags: ['trips'], summary: 'KPIViagens aggregate' } })
      // Fix B2 — opções do filtro de rota: UNION Torre (routes) + Ranking (route_scores) + Cargas (origem→destino)
      .get('/route-options', () => getTripRouteOptions(), { detail: { tags: ['trips'], summary: 'Route filter options (Torre + Ranking + Cargas)' } })
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
          limit:      t.Optional(t.Numeric({ minimum: 1, maximum: 20000 })),
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
      .get('/:id/risk', async ({ params, set }) => {
        // Try persisted snapshot first; fall back to live recompute when missing
        const persisted = await getTripRisk(params.id)
        if (persisted) return persisted
        const live = await recalcTripRisk(params.id)
        if (!live) { set.status = 404; return { error: 'Trip not found' } }
        return live
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        detail: { tags: ['trips'], summary: 'Delivery risk score + factor breakdown' },
      })
      .post('/:id/risk/recalc', async ({ params, set }) => {
        const r = await recalcTripRisk(params.id)
        if (!r) { set.status = 404; return { error: 'Trip not found' } }
        return r
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        detail: { tags: ['trips'], summary: 'Force risk recompute (admin/debug)' },
      })
      // Phase 12 (D-12-29) — nota/intervenção do operador → trip_event local
      .post('/:id/note', async ({ params, body, user, set }) => {
        const r = await addTripNote({ tripId: params.id, userId: user.id, text: body.text, kind: body.kind })
        if (!r) { set.status = 404; return { error: 'Trip not found' } }
        return r
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        body:   t.Object({
          text: t.String({ minLength: 1, maxLength: 2000 }),
          kind: t.Optional(t.Union([t.Literal('manual_note'), t.Literal('reagendamento'), t.Literal('autorizacao_atraso')])),
        }),
        detail: { tags: ['trips'], summary: 'Add operator note/intervention to trip timeline' },
      })
  )
