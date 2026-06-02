import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { alerts } from '../../db/schema/alerts'
import { treatments } from '../../db/schema/treatments'
import { tripEvents } from '../../db/schema/trip-events'
import { redis } from '../../redis/client'
import { logger } from '../../lib/logger'

// Canonical occurrence lifecycle. Each state declares allowed next states.
// Edges that try to skip steps are rejected at the service layer, not the DB.
export type AlertStatus =
  | 'aberto'        // Nova
  | 'em_analise'    // Em análise (triage)
  | 'em_tratativa'  // Em tratativa
  | 'resolvido'     // Resolvida
  | 'encerrado'     // Encerrada (post-mortem closed)

const TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  aberto:       ['em_analise', 'em_tratativa', 'resolvido', 'encerrado'],
  em_analise:   ['em_tratativa', 'resolvido', 'encerrado'],
  em_tratativa: ['resolvido', 'encerrado'],
  resolvido:    ['encerrado', 'em_tratativa'], // can re-open if it wasn't actually solved
  encerrado:    [],                            // terminal
}

export const ALERT_STATUSES: AlertStatus[] = ['aberto', 'em_analise', 'em_tratativa', 'resolvido', 'encerrado']

export function canTransition(from: AlertStatus, to: AlertStatus): boolean {
  if (from === to) return false
  return TRANSITIONS[from]?.includes(to) ?? false
}

// Map workflow events to trip_event types so the unified timeline reflects
// the ocorrência lifecycle inline with operational events.
const STATUS_TO_EVENT: Record<AlertStatus, string | null> = {
  aberto:       null, // initial state — alert insert already shows up via timeline merge
  em_analise:   'alert_under_review',
  em_tratativa: 'alert_in_treatment',
  resolvido:    'alert_resolved',
  encerrado:    'alert_closed',
}

export class WorkflowError extends Error {
  constructor(public readonly code: string, message: string) { super(message) }
}

export async function transitionAlert(opts: {
  alertId:  string
  to:       AlertStatus
  userId:   string
  notes?:   string
}) {
  const a = await db.query.alerts.findFirst({ where: eq(alerts.id, opts.alertId) })
  if (!a) throw new WorkflowError('NOT_FOUND', 'Alert not found')
  const from = a.status as AlertStatus
  if (!canTransition(from, opts.to)) {
    throw new WorkflowError('INVALID_TRANSITION', `Cannot transition from ${from} to ${opts.to}`)
  }

  const patch: Partial<typeof alerts.$inferInsert> = { status: opts.to }
  if (opts.to === 'resolvido' && !a.resolvedAt) patch.resolvedAt = new Date()
  if (opts.to === 'em_tratativa' && !a.assignedTo) patch.assignedTo = opts.userId

  const [updated] = await db.update(alerts).set(patch).where(eq(alerts.id, opts.alertId)).returning()

  // Audit trail — every transition leaves a treatment row
  await db.insert(treatments).values({
    alertId:    opts.alertId,
    tripId:     a.tripId,
    operatorId: opts.userId,
    actionType: `transition:${from}_to_${opts.to}`,
    notes:      opts.notes,
    outcome:    opts.to === 'resolvido' ? 'resolvido' : opts.to === 'encerrado' ? 'resolvido' : 'pendente',
  })

  // Emit a trip_event so the trip timeline reflects this lifecycle event
  const evtType = STATUS_TO_EVENT[opts.to]
  if (evtType && a.tripId) {
    await db.insert(tripEvents).values({
      tripId:     a.tripId,
      eventType:  evtType,
      occurredAt: new Date(),
      notes:      opts.notes ?? `Ocorrência ${a.title}`,
      createdBy:  opts.userId,
      metadata:   { alertId: opts.alertId, from, to: opts.to },
    })
    await redis.publish('timeline:new', JSON.stringify({
      type: 'timeline:new', tripId: a.tripId, kind: evtType, alertId: opts.alertId,
    })).catch(() => {/* best-effort */})
  }

  logger.info({ alertId: opts.alertId, from, to: opts.to, userId: opts.userId }, 'alert transition')
  return updated!
}

export async function addComment(opts: {
  alertId: string
  userId:  string
  text:    string
}) {
  const a = await db.query.alerts.findFirst({ where: eq(alerts.id, opts.alertId) })
  if (!a) throw new WorkflowError('NOT_FOUND', 'Alert not found')
  const [t] = await db.insert(treatments).values({
    alertId:    opts.alertId,
    tripId:     a.tripId,
    operatorId: opts.userId,
    actionType: 'comment',
    notes:      opts.text,
    outcome:    'pendente',
  }).returning()
  return t!
}

export async function setAlertPriority(opts: { alertId: string; priority: 'alta' | 'media' | 'baixa' }) {
  const [r] = await db.update(alerts)
    .set({ priority: opts.priority })
    .where(eq(alerts.id, opts.alertId))
    .returning()
  return r ?? null
}

export async function assignAlertTo(opts: { alertId: string; userId: string; currentUserId: string }) {
  const [r] = await db.update(alerts)
    .set({ assignedTo: opts.userId })
    .where(eq(alerts.id, opts.alertId))
    .returning()
  if (!r) return null
  // Audit
  await db.insert(treatments).values({
    alertId:    opts.alertId,
    tripId:     r.tripId,
    operatorId: opts.currentUserId,
    actionType: 'assign',
    notes:      opts.userId === opts.currentUserId ? 'Auto-atribuído' : `Atribuído ao usuário ${opts.userId}`,
    outcome:    'pendente',
  })
  return r
}

export async function listAlertHistory(alertId: string) {
  return db.query.treatments.findMany({
    where: eq(treatments.alertId, alertId),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  })
}
