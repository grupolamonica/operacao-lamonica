import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { redis } from '../redis/client'
import { trips } from '../db/schema/trips'
import { alerts } from '../db/schema/alerts'
import { logger } from '../lib/logger'
import { dispatchAlertPush } from '../modules/push/push.dispatcher'
import { processGeofenceDetection } from './geofence-detector'
import { recalcTripRisk } from '../modules/risk/risk.service'
import { evaluateTripSla } from '../modules/sla/sla.service'

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

  // Geofence entry/exit — non-blocking on alert pipeline. Failures must NOT
  // break alert detection, so wrap in try/catch.
  processGeofenceDetection({ vehicleId, tripId: trip.id, lat, lng, capturedAt })
    .catch((e) => logger.error({ error: e?.message ?? String(e), vehicleId, tripId: trip.id }, 'geofence detection failed'))

  // Risk recalc — Sprint 3. Runs after alerts so the latest open-alert count
  // is reflected. Non-blocking; never fails the telemetry path.
  recalcTripRisk(trip.id)
    .catch((e) => logger.error({ error: e?.message ?? String(e), tripId: trip.id }, 'risk recalc failed'))

  // SLA evaluation — Sprint 4. autoAlert=true raises sla_em_risco/sla_quebrado/
  // sla_multa alerts (debounced 30min per status). Non-blocking.
  evaluateTripSla(trip.id, { autoAlert: true })
    .catch((e) => logger.error({ error: e?.message ?? String(e), tripId: trip.id }, 'sla evaluation failed'))

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

    // Fire-and-forget Web Push dispatch (CONTEXT D-15 / T-06.04-03):
    // the alert is already persisted at this point — push failures must
    // NEVER block or fail the telemetry pipeline. dispatchAlertPush itself
    // catches internally, the extra .catch() here is defense in depth.
    dispatchAlertPush({
      id:          inserted.id,
      title:       a.title,
      description: a.description ?? '',
      severity:    a.severity as 'critico' | 'medio' | 'baixo',
    }).catch((e: any) =>
      logger.error(
        { error: e?.message ?? String(e), alertId: inserted.id },
        'push dispatch failed',
      ),
    )
  }
}
