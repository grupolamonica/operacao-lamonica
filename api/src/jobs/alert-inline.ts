import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { redis } from '../redis/client'
import { trips } from '../db/schema/trips'
import { alerts } from '../db/schema/alerts'
import { logger } from '../lib/logger'

const DELAY_CRITICAL_MINUTES = 30
const STOP_MINUTES            = 5
const ALERT_BROADCAST_CHANNEL = 'alerts:new'

export async function processAlertDetection(
  vehicleId: string,
  lat: number,
  lng: number,
  speed: number,
  capturedAt: string,
): Promise<void> {
  const capturedTime = new Date(capturedAt)
  const now = new Date()

  // Find active trip for this vehicle
  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.vehicleId, vehicleId), eq(trips.status, 'in_progress')),
    with: { client: { columns: { name: true } } },
  })
  if (!trip) return

  // Update last_update timestamp
  await redis.set(`last_update:${vehicleId}`, capturedAt, 'EX', 3600)

  const detectedAlerts: Array<{ type: string; severity: string; title: string; description: string; delayMinutes?: number }> = []

  // 1. Critical delay: ETA > windowEnd + threshold
  if (trip.eta && trip.windowEnd) {
    const delayMin = Math.round((trip.eta.getTime() - trip.windowEnd.getTime()) / 60_000)
    if (delayMin >= DELAY_CRITICAL_MINUTES) {
      const existing = await db.query.alerts.findFirst({
        where: and(
          eq(alerts.tripId, trip.id),
          eq(alerts.type, 'atraso_critico'),
          eq(alerts.status, 'aberto'),
        ),
      })
      if (!existing) {
        detectedAlerts.push({
          type: 'atraso_critico',
          severity: delayMin >= 60 ? 'critico' : 'medio',
          title: `Atraso crítico — ${trip.code}`,
          description: `Viagem com ${delayMin}min de atraso previsto`,
          delayMinutes: delayMin,
        })
      }
    }
  }

  // 2. Unplanned stop: speed < 2 km/h for > STOP_MINUTES
  const stopKey = `stop:${vehicleId}`
  if (speed < 2) {
    const firstStopStr = await redis.get(stopKey)
    if (!firstStopStr) {
      await redis.set(stopKey, capturedAt, 'EX', 3600)
    } else {
      const stopMin = Math.round((capturedTime.getTime() - new Date(firstStopStr).getTime()) / 60_000)
      if (stopMin >= STOP_MINUTES) {
        const existing = await db.query.alerts.findFirst({
          where: and(
            eq(alerts.tripId, trip.id),
            eq(alerts.type, 'parada_nao_planejada'),
            eq(alerts.status, 'aberto'),
          ),
        })
        if (!existing) {
          detectedAlerts.push({
            type: 'parada_nao_planejada',
            severity: 'medio',
            title: `Parada não planejada — ${trip.code}`,
            description: `Veículo parado há ${stopMin}min`,
          })
        }
      }
    }
  } else {
    await redis.del(stopKey)
  }

  // Insert and broadcast new alerts
  for (const a of detectedAlerts) {
    const [inserted] = await db.insert(alerts).values({
      type:         a.type,
      severity:     a.severity as any,
      status:       'aberto',
      tripId:       trip.id,
      driverId:     trip.driverId,
      vehicleId,
      title:        a.title,
      description:  a.description,
      source:       'Telemetria',
      lat:          String(lat),
      lng:          String(lng),
      delayMinutes: a.delayMinutes,
      occurredAt:   now,
      slaDeadline:  new Date(now.getTime() + 4 * 3600_000),
    }).returning()

    await redis.publish(ALERT_BROADCAST_CHANNEL, JSON.stringify({
      type:      'alert:new',
      alertId:   inserted.id,
      severity:  a.severity,
      alertType: a.type,
      tripId:    trip.id,
      title:     a.title,
    }))

    logger.info({ alertId: inserted.id, type: a.type, tripId: trip.id }, 'alert created')
  }
}
