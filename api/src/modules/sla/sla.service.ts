import { and, eq, inArray, gte, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { trips } from '../../db/schema/trips'
import { alerts } from '../../db/schema/alerts'
import { slaRules } from '../../db/schema/sla-rules'
import { clients } from '../../db/schema/clients'
import { redis } from '../../redis/client'
import { logger } from '../../lib/logger'
import { evaluateSla, resolveRule, type SlaRule } from './sla.engine'

const DEBOUNCE_KEY  = (tripId: string, status: string) => `sla:alert:${tripId}:${status}`
const DEBOUNCE_TTL  = 30 * 60 // 30 min between repeated alerts for the same trip+status

// In-memory rule cache (rules rarely change; refreshed every 60s)
let rulesCache: Array<SlaRule & { clientId: string | null; active: boolean }> = []
let rulesLoadedAt = 0
const RULES_TTL_MS = 60_000

async function loadRules() {
  if (Date.now() - rulesLoadedAt < RULES_TTL_MS && rulesCache.length > 0) return rulesCache
  const rows = await db.select().from(slaRules)
  rulesCache = rows.map((r) => ({
    id:                   r.id,
    name:                 r.name,
    warningPct:           r.warningPct,
    breachGraceMinutes:   r.breachGraceMinutes,
    fineThresholdMinutes: r.fineThresholdMinutes,
    clientId:             r.clientId,
    active:               r.active,
  }))
  rulesLoadedAt = Date.now()
  return rulesCache
}

const STATUS_TO_ALERT_TYPE: Record<string, string> = {
  em_risco: 'sla_em_risco',
  quebrado: 'sla_quebrado',
  multa:    'sla_multa',
}

const STATUS_TO_SEVERITY: Record<string, 'baixo' | 'medio' | 'critico'> = {
  em_risco: 'medio',
  quebrado: 'critico',
  multa:    'critico',
}

/** Evaluate a single trip. Returns the evaluation; optionally auto-creates an alert. */
export async function evaluateTripSla(tripId: string, opts: { autoAlert?: boolean } = {}) {
  const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) })
  if (!trip) return null
  const rules = await loadRules()
  const rule = resolveRule({ clientId: trip.clientId }, rules as any)
  if (!rule) return null

  const evaluation = evaluateSla({
    windowStart: trip.windowStart,
    windowEnd:   trip.windowEnd,
    now:         new Date(),
    arrivedAt:   trip.arrivedAt,
    status:      trip.status,
  }, rule)

  if (opts.autoAlert && (evaluation.status === 'em_risco' || evaluation.status === 'quebrado' || evaluation.status === 'multa')) {
    await maybeCreateSlaAlert(trip, evaluation)
  }

  return evaluation
}

async function maybeCreateSlaAlert(trip: typeof trips.$inferSelect, ev: NonNullable<Awaited<ReturnType<typeof evaluateTripSla>>>) {
  const debounceKey = DEBOUNCE_KEY(trip.id, ev.status)
  const recent = await redis.get(debounceKey)
  if (recent) return // already alerted recently — skip

  const alertType = STATUS_TO_ALERT_TYPE[ev.status]!
  const severity  = STATUS_TO_SEVERITY[ev.status]!

  // Guard: don't duplicate an open alert of the same type for this trip
  const existing = await db.query.alerts.findFirst({
    where: and(
      eq(alerts.tripId, trip.id),
      eq(alerts.type, alertType),
      inArray(alerts.status, ['aberto', 'em_analise', 'em_tratativa']),
    ),
  })
  if (existing) {
    await redis.set(debounceKey, '1', 'EX', DEBOUNCE_TTL)
    return
  }

  const now = new Date()
  await db.insert(alerts).values({
    type:        alertType,
    severity,
    status:      'aberto',
    priority:    ev.status === 'multa' ? 'alta' : 'media',
    tripId:      trip.id,
    driverId:    trip.driverId,
    vehicleId:   trip.vehicleId,
    title:       `SLA ${ev.status.replace('_', ' ')} — ${trip.code}`,
    description: `${ev.reason}. Regra: ${ev.ruleName}.`,
    source:      'Telemetria',
    delayMinutes: ev.minutesOverdue || null,
    occurredAt:  now,
    slaDeadline: trip.windowEnd,
  }).catch((e) => {
    logger.error({ tripId: trip.id, error: (e as Error).message }, 'sla auto-alert failed')
  })

  await redis.set(debounceKey, '1', 'EX', DEBOUNCE_TTL)
  logger.info({ tripId: trip.id, slaStatus: ev.status, ruleId: ev.ruleId }, 'sla alert created')
}

/** Bulk: evaluate every active trip. Returns counts by status. */
export async function evaluateAllActiveTrips() {
  const rules = await loadRules()
  const active = await db.query.trips.findMany({
    where: inArray(trips.status, ['in_progress', 'planned', 'delayed']),
  })
  const counts: Record<string, number> = { no_prazo: 0, em_risco: 0, quebrado: 0, multa: 0 }
  for (const trip of active) {
    const rule = resolveRule({ clientId: trip.clientId }, rules as any)
    if (!rule) continue
    const ev = evaluateSla({
      windowStart: trip.windowStart,
      windowEnd:   trip.windowEnd,
      now:         new Date(),
      arrivedAt:   trip.arrivedAt,
      status:      trip.status,
    }, rule)
    counts[ev.status] = (counts[ev.status] ?? 0) + 1
    if (ev.status !== 'no_prazo') await maybeCreateSlaAlert(trip, ev)
  }
  return counts
}

/** Dashboard aggregator: SLA pct over a window + breakdown by client. */
export async function getSlaDashboard(period: 'today' | '7d' | '30d') {
  const cutoff = new Date()
  if (period === 'today') cutoff.setHours(0, 0, 0, 0)
  else if (period === '7d')  cutoff.setDate(cutoff.getDate() - 7)
  else                       cutoff.setDate(cutoff.getDate() - 30)

  // Completed trips in the window
  const completed = await db.query.trips.findMany({
    where: and(
      eq(trips.status, 'completed'),
      gte(trips.arrivedAt, cutoff),
    ),
  })
  const total  = completed.length
  const onTime = completed.filter((t) => t.arrivedAt && t.arrivedAt <= t.windowEnd).length
  const pct    = total > 0 ? Math.round((onTime / total) * 100) : 100

  // Per-client breakdown
  const byClient = new Map<string, { total: number; onTime: number; clientName: string }>()
  const clientIds = [...new Set(completed.map((t) => t.clientId).filter((x): x is string => !!x))]
  const clientRows = clientIds.length
    ? await db.select({ id: clients.id, name: clients.name }).from(clients).where(inArray(clients.id, clientIds))
    : []
  const clientNameById = new Map(clientRows.map((c) => [c.id, c.name]))
  for (const t of completed) {
    if (!t.clientId) continue
    const cur = byClient.get(t.clientId) ?? { total: 0, onTime: 0, clientName: clientNameById.get(t.clientId) ?? '—' }
    cur.total++
    if (t.arrivedAt && t.arrivedAt <= t.windowEnd) cur.onTime++
    byClient.set(t.clientId, cur)
  }

  // Live counts from this minute's evaluation (does not auto-alert)
  const rules  = await loadRules()
  const live   = await db.query.trips.findMany({
    where: inArray(trips.status, ['in_progress', 'planned', 'delayed']),
  })
  const liveCounts: Record<string, number> = { no_prazo: 0, em_risco: 0, quebrado: 0, multa: 0 }
  for (const t of live) {
    const rule = resolveRule({ clientId: t.clientId }, rules as any)
    if (!rule) continue
    const ev = evaluateSla({ windowStart: t.windowStart, windowEnd: t.windowEnd, now: new Date(), arrivedAt: t.arrivedAt, status: t.status }, rule)
    liveCounts[ev.status] = (liveCounts[ev.status] ?? 0) + 1
  }

  return {
    period,
    pctOnTime:  pct,
    totalCompleted: total,
    onTimeCount:   onTime,
    breakdownByClient: [...byClient.entries()].map(([clientId, v]) => ({
      clientId,
      clientName: v.clientName,
      total:      v.total,
      onTime:     v.onTime,
      pct:        v.total > 0 ? Math.round((v.onTime / v.total) * 100) : 100,
    })).sort((a, b) => b.total - a.total),
    liveCounts,
  }
}

export async function listSlaRules() {
  return db.query.slaRules.findMany({ orderBy: (r, { asc }) => [asc(r.clientId), asc(r.name)] })
}
