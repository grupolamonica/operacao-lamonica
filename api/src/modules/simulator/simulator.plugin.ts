import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { simulateRoutes } from './simulator.service'

export const simulatorPlugin = new Elysia({ name: 'simulator' })
  .use(authGuard)
  .group('/api/simulator', (app) =>
    app
      .post('/routes', ({ body }) => simulateRoutes(body), {
        body: t.Object({
          origin:      t.Object({ lat: t.Number({ minimum: -90, maximum: 90 }), lng: t.Number({ minimum: -180, maximum: 180 }) }),
          destination: t.Object({ lat: t.Number({ minimum: -90, maximum: 90 }), lng: t.Number({ minimum: -180, maximum: 180 }) }),
          vehicleType: t.Optional(t.Union([t.Literal('Van'), t.Literal('Furgão'), t.Literal('VUC'), t.Null()])),
        }),
        detail: { tags: ['simulator'], summary: 'Simulate route alternatives from historical trip data' },
      })
  )
