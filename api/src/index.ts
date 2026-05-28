import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { eq } from 'drizzle-orm'

import { logger } from './lib/logger'
import { db } from './db/client'
import { redis } from './redis/client'
import { vehicles } from './db/schema/vehicles'
import { drivers } from './db/schema/drivers'
import { trips } from './db/schema/trips'
import { authPlugin } from './modules/auth/auth.plugin'
import { tripsPlugin } from './modules/trips/trips.plugin'
import { driversPlugin } from './modules/drivers/drivers.plugin'
import { alertsPlugin } from './modules/alerts/alerts.plugin'
import { vehiclesPlugin } from './modules/vehicles/vehicles.plugin'
import { dashboardPlugin } from './modules/dashboard/dashboard.plugin'
import { wsPlugin } from './modules/ws/ws.plugin'
import { processAlertDetection } from './jobs/alert-inline'

const PORT = Number(process.env.PORT ?? 3000)
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173'
const TELEMETRY_API_KEY = process.env.TELEMETRY_API_KEY ?? 'dev-telemetry-key'
const POSITIONS_CHANNEL = 'positions:update'

async function computeSlaStatus(vehicleId: string): Promise<string> {
  const trip = await db.query.trips.findFirst({
    where: eq(trips.vehicleId, vehicleId),
    columns: { id: true, slaStatus: true, status: true },
  })
  if (!trip || trip.status !== 'in_progress') return 'sem_sinal'
  return trip.slaStatus ?? 'no_prazo'
}

export const app = new Elysia()
  .use(cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }))
  .use(swagger({
    path: '/swagger',
    documentation: {
      info: { title: 'Torre de Controle API', version: '0.2.0', description: 'API de monitoramento de entregas em tempo real' },
      tags: [
        { name: 'auth',      description: 'Autenticação (HttpOnly Cookie JWT)' },
        { name: 'trips',     description: 'Viagens e KPIs' },
        { name: 'drivers',   description: 'Motoristas e KPIs' },
        { name: 'alerts',    description: 'Alertas + tratativas' },
        { name: 'vehicles',  description: 'Frota' },
        { name: 'dashboard', description: 'KPIs agregados (Redis cache)' },
        { name: 'telemetry', description: 'GPS ingest + posições em tempo real' },
      ],
    },
  }))
  .get('/', () => ({ status: 'ok', service: 'torre-api', version: '0.2.0' }))
  .onError(({ code, error, set }) => {
    const msg = error instanceof Error ? error.message : String(error)
    if (code === 'VALIDATION') { set.status = 422; return { error: 'Validation error', details: msg.slice(0, 200) } }
    if (set.status === 401 || set.status === 403 || set.status === 404 || set.status === 429) return { error: msg }
    logger.error({ code, error: msg }, 'unhandled error')
    set.status = 500
    return { error: 'Internal server error' }
  })
  .use(authPlugin)
  .use(tripsPlugin)
  .use(driversPlugin)
  .use(alertsPlugin)
  .use(vehiclesPlugin)
  .use(dashboardPlugin)
  .use(wsPlugin)
  // Telemetry inlined to avoid Elysia 1.4.28 plugin-composition issue with body schema
  .post('/api/telemetry/ingest', async ({ body, headers, set }) => {
    const apiKey = (headers as Record<string,string>)['x-api-key'] ?? (headers as Record<string,string>)['authorization']?.replace('Bearer ', '')
    if (apiKey !== TELEMETRY_API_KEY) { set.status = 401; return { error: 'Invalid API key' } }
    const { vehicleId, lat, lng, speed, heading, capturedAt } = body as any
    const vehicle = await db.query.vehicles.findFirst({ where: eq(vehicles.id, vehicleId), columns: { id: true, driverId: true } })
    if (!vehicle) { set.status = 404; return { error: 'Vehicle not found' } }
    const pos = { vehicleId, lat: String(lat), lng: String(lng), speed: String(speed ?? 0), heading: String(heading ?? 0), capturedAt: capturedAt ?? new Date().toISOString() }
    await redis.hset(`vehicle:${vehicleId}:position`, pos)
    await redis.expire(`vehicle:${vehicleId}:position`, 300)
    if (vehicle.driverId) await db.update(drivers).set({ lat: String(lat), lng: String(lng) }).where(eq(drivers.id, vehicle.driverId))
    const slaStatus = await computeSlaStatus(vehicleId)
    await redis.publish(POSITIONS_CHANNEL, JSON.stringify({ ...pos, slaStatus, lat, lng }))

    // Alert detection (inline async, ~50ms overhead)
    await processAlertDetection(vehicleId, lat, lng, Number(speed ?? 0), capturedAt ?? new Date().toISOString()).catch(e =>
      logger.error({ error: e.message }, 'alert detection error')
    )

    logger.debug({ vehicleId, lat, lng, slaStatus }, 'telemetry ingested')
    return { ok: true, slaStatus }
  })
  .get('/api/telemetry/positions', async () => {
    const keys = await redis.keys('vehicle:*:position')
    const positions = await Promise.all(keys.map(async k => { const p = await redis.hgetall(k); return p && Object.keys(p).length > 0 ? p : null }))
    return positions.filter(Boolean)
  })
  .listen(PORT, () => {
    logger.info({ port: PORT, frontendUrl: FRONTEND_URL }, 'torre-api listening')
  })

// Eden Treaty type export (D-04)
export type App = typeof app
