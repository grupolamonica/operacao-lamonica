import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { listVehicles } from './vehicles.service'
import { getVehicleContext } from './vehicles.context'

export const vehiclesPlugin = new Elysia({ name: 'vehicles' })
  .use(authGuard)
  .group('/api/vehicles', (app) =>
    app
      .get('/', () => listVehicles(), { detail: { tags: ['vehicles'], summary: 'List vehicles' } })
      .get('/:id/context', async ({ params, set }) => {
        const ctx = await getVehicleContext(params.id)
        if (!ctx) { set.status = 404; return { error: 'Vehicle not found' } }
        return ctx
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        detail: { tags: ['vehicles'], summary: 'Operator context — driver, active trip, alerts, timeline' },
      })
  )
