import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { listDrivers, getDriverById, getDriverStats, getDriverDossie } from './drivers.service'

const driverStatus = t.Union([t.Literal('available'), t.Literal('on_route'), t.Literal('unavailable')])

export const driversPlugin = new Elysia({ name: 'drivers' })
  .use(authGuard)
  .group('/api/drivers', (app) =>
    app
      .get('/stats', () => getDriverStats(), { detail: { tags: ['drivers'], summary: 'KPIMotoristas' } })
      .get('/', ({ query }) => listDrivers({ status: query.status, base: query.base, search: query.search }), {
        query: t.Object({
          status: t.Optional(driverStatus),
          base:   t.Optional(t.String()),
          search: t.Optional(t.String()),
        }),
        detail: { tags: ['drivers'], summary: 'List drivers with filters' },
      })
      .get('/:id', async ({ params, set }) => {
        const d = await getDriverById(params.id)
        if (!d) { set.status = 404; return { error: 'Driver not found' } }
        return d
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        detail: { tags: ['drivers'], summary: 'Get driver by id' },
      })
      .get('/:id/dossie', async ({ params, set }) => {
        const dossie = await getDriverDossie(params.id)
        if (!dossie) { set.status = 404; return { error: 'Driver not found' } }
        return dossie
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        detail: { tags: ['drivers'], summary: 'Dossiê consolidado do motorista (cruzamento total)' },
      })
  )
