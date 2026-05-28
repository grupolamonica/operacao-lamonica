import { Elysia } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { listVehicles } from './vehicles.service'

export const vehiclesPlugin = new Elysia({ name: 'vehicles' })
  .use(authGuard)
  .group('/api/vehicles', (app) =>
    app.get('/', () => listVehicles(), { detail: { tags: ['vehicles'], summary: 'List vehicles' } })
  )
