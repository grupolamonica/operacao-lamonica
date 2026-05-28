import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'

import { logger } from './lib/logger'
import { authPlugin } from './modules/auth/auth.plugin'
import { tripsPlugin } from './modules/trips/trips.plugin'
import { driversPlugin } from './modules/drivers/drivers.plugin'
import { alertsPlugin } from './modules/alerts/alerts.plugin'
import { vehiclesPlugin } from './modules/vehicles/vehicles.plugin'
import { dashboardPlugin } from './modules/dashboard/dashboard.plugin'

const PORT = Number(process.env.PORT ?? 3000)
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173'

export const app = new Elysia()
  // CORS — explicit origin required when credentials:true (RESEARCH Pitfall #2)
  .use(cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }))
  // Swagger / OpenAPI
  .use(swagger({
    path: '/swagger',
    documentation: {
      info: {
        title: 'Torre de Controle API',
        version: '0.2.0',
        description: 'API de monitoramento de entregas em tempo real',
      },
      tags: [
        { name: 'auth',      description: 'Autenticação (HttpOnly Cookie JWT)' },
        { name: 'trips',     description: 'Viagens e KPIs' },
        { name: 'drivers',   description: 'Motoristas e KPIs' },
        { name: 'alerts',    description: 'Alertas + tratativas' },
        { name: 'vehicles',  description: 'Frota' },
        { name: 'dashboard', description: 'KPIs agregados (Redis cache)' },
      ],
    },
  }))
  // Health
  .get('/', () => ({ status: 'ok', service: 'torre-api', version: '0.2.0' }))
  // Error handler
  .onError(({ code, error, set }) => {
    const msg = error instanceof Error ? error.message : String(error)
    if (set.status === 401 || set.status === 403 || set.status === 404 || set.status === 429) {
      return { error: msg }
    }
    logger.error({ code, error: msg }, 'unhandled error')
    set.status = 500
    return { error: 'Internal server error' }
  })
  // Modules (all .use() before type App capture — RESEARCH Pitfall #5)
  .use(authPlugin)
  .use(tripsPlugin)
  .use(driversPlugin)
  .use(alertsPlugin)
  .use(vehiclesPlugin)
  .use(dashboardPlugin)
  .listen(PORT, () => {
    logger.info({ port: PORT, frontendUrl: FRONTEND_URL }, 'torre-api listening')
  })

// CRITICAL: must be after all .use() for Eden Treaty type accuracy (D-04)
export type App = typeof app
