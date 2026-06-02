import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import { trips } from '../../db/schema/trips'
import { alerts } from '../../db/schema/alerts'
import { redis } from '../../redis/client'
import { logger } from '../../lib/logger'
import { calculateDeliveryRisk, type RiskInput, type RiskResult } from './risk.engine'

const OPEN_STATUSES = ['aberto', 'em_analise', 'em_tratativa']

/**
 * Recompute risk for a single trip and persist on the trips row.
 * Reads last_update + stop state from Redis (already maintained by the
 * alert pipeline) and counts open alerts straight from Postgres.
 */
export async function recalcTripRisk(tripId: string): Promise<RiskResult | null> {
  const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) })
  if (!trip) return null

  const [lastUpdateStr, stopStartStr, openAlerts] = await Promise.all([
    trip.vehicleId ? redis.get(`last_update:${trip.vehicleId}`) : Promise.resolve(null),
    trip.vehicleId ? redis.get(`stop:${trip.vehicleId}`)        : Promise.resolve(null),
    db.select({ severity: alerts.severity })
      .from(alerts)
      .where(and(
        eq(alerts.tripId, trip.id),
        inArray(alerts.status, OPEN_STATUSES),
      )),
  ])

  const now = new Date()
  const lastUpdateAt = lastUpdateStr ? new Date(lastUpdateStr) : null
  const stoppedSinceMin = stopStartStr
    ? Math.round((now.getTime() - new Date(stopStartStr).getTime()) / 60_000)
    : null

  const input: RiskInput = {
    windowEnd:          trip.windowEnd,
    eta:                trip.eta,
    status:             trip.status,
    progressPct:        trip.progressPct ?? 0,
    distanceTotal:      trip.distanceTotal ? Number(trip.distanceTotal) : null,
    distanceDone:       trip.distanceDone  ? Number(trip.distanceDone)  : null,
    departedAt:         trip.departedAt,
    now,
    lastUpdateAt,
    openAlertCount:     openAlerts.length,
    criticalAlertCount: openAlerts.filter((a) => a.severity === 'critico').length,
    stoppedSinceMin,
  }

  const result = calculateDeliveryRisk(input)

  await db.update(trips)
    .set({
      riskScore:        result.score,
      riskLevel:        result.level,
      riskFactors:      result.factors,
      riskCalculatedAt: now,
    })
    .where(eq(trips.id, tripId))

  return result
}

/**
 * Read the persisted risk snapshot (no recompute). Returns null if the trip
 * has never been scored.
 */
export async function getTripRisk(tripId: string): Promise<RiskResult | null> {
  const trip = await db.query.trips.findFirst({
    where: eq(trips.id, tripId),
    columns: { riskScore: true, riskLevel: true, riskFactors: true },
  })
  if (!trip || trip.riskScore == null || !trip.riskLevel) return null
  return {
    score:   trip.riskScore,
    level:   trip.riskLevel as RiskResult['level'],
    factors: (trip.riskFactors as RiskResult['factors']) ?? [],
  }
}

/**
 * Backfill risk for all non-terminal trips. One-off / admin endpoint use.
 * Sequential to avoid swamping Redis with 60 parallel `last_update` reads.
 */
export async function backfillAllTripsRisk(): Promise<{ processed: number; failed: number }> {
  const rows = await db.select({ id: trips.id }).from(trips)
    .where(inArray(trips.status, ['planned', 'in_progress', 'delayed']))
  let processed = 0, failed = 0
  for (const r of rows) {
    try { await recalcTripRisk(r.id); processed++ }
    catch (e) { failed++; logger.error({ tripId: r.id, error: (e as Error).message }, 'risk backfill failed') }
  }
  return { processed, failed }
}
