import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { redis } from '../../redis/client'
import { vehicles } from '../../db/schema/vehicles'
import { drivers } from '../../db/schema/drivers'
import { trips } from '../../db/schema/trips'
import { logger } from '../../lib/logger'

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

export const telemetryPlugin = new Elysia({ name: 'telemetry' })
  .post('/api/telemetry/ingest', async ({ body, headers, set }) => {
    const apiKey = headers['x-api-key'] ?? headers['authorization']?.replace('Bearer ', '')
    if (apiKey !== TELEMETRY_API_KEY) {
      set.status = 401
      return { error: 'Invalid API key' }
    }

    const { vehicleId, lat, lng, speed, heading, capturedAt } = body

    const vehicle = await db.query.vehicles.findFirst({
      where: eq(vehicles.id, vehicleId),
      columns: { id: true, driverId: true },
    })

    if (!vehicle) {
      set.status = 404
      return { error: 'Vehicle not found' }
    }

    const position = {
      vehicleId,
      lat:       String(lat),
      lng:       String(lng),
      speed:     String(speed ?? 0),
      heading:   String(heading ?? 0),
      capturedAt: capturedAt ?? new Date().toISOString(),
    }
    await redis.hset(`vehicle:${vehicleId}:position`, position)
    await redis.expire(`vehicle:${vehicleId}:position`, 300)

    if (vehicle.driverId) {
      await db.update(drivers)
        .set({ lat: String(lat), lng: String(lng) })
        .where(eq(drivers.id, vehicle.driverId))
    }

    const slaStatus = await computeSlaStatus(vehicleId)
    await redis.publish(POSITIONS_CHANNEL, JSON.stringify({ ...position, slaStatus, lat, lng }))

    logger.debug({ vehicleId, lat, lng, slaStatus }, 'telemetry ingested')
    return { ok: true, slaStatus }
  }, {
    body: t.Object({
      vehicleId:  t.String({ minLength: 36, maxLength: 36 }),
      lat:        t.Number({ minimum: -90,  maximum: 90 }),
      lng:        t.Number({ minimum: -180, maximum: 180 }),
      speed:      t.Optional(t.Number({ minimum: 0 })),
      heading:    t.Optional(t.Number({ minimum: 0, maximum: 360 })),
      capturedAt: t.Optional(t.String()),
    }),
  })
  .get('/api/telemetry/positions', async () => {
    const keys = await redis.keys('vehicle:*:position')
    const positions = await Promise.all(
      keys.map(async key => {
        const pos = await redis.hgetall(key)
        return pos && Object.keys(pos).length > 0 ? pos : null
      })
    )
    return positions.filter(Boolean)
  }, {
    detail: { tags: ['telemetry'], summary: 'Snapshot of all current vehicle positions' },
  })
