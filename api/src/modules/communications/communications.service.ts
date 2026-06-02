import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { communications } from '../../db/schema/communications'

export type Channel   = 'call' | 'sms' | 'whatsapp' | 'note'
export type Direction = 'out'  | 'in'
export type Outcome   = 'atendida' | 'nao_atendida' | 'caixa_postal' | 'enviada' | 'recebida'

export interface CreateCommunicationInput {
  driverId?:   string | null
  tripId?:     string | null
  alertId?:    string | null
  operatorId:  string
  channel:     Channel
  direction?:  Direction
  content?:    string
  durationSec?: number
  outcome?:    Outcome
  occurredAt?: Date
}

export class CommError extends Error {
  constructor(public code: string, msg: string) { super(msg) }
}

export async function logCommunication(input: CreateCommunicationInput) {
  if (!input.driverId && !input.tripId && !input.alertId) {
    throw new CommError('SCOPE_REQUIRED', 'At least one of driverId/tripId/alertId is required')
  }
  const [row] = await db.insert(communications).values({
    driverId:    input.driverId ?? null,
    tripId:      input.tripId   ?? null,
    alertId:     input.alertId  ?? null,
    operatorId:  input.operatorId,
    channel:     input.channel,
    direction:   input.direction ?? 'out',
    content:     input.content,
    durationSec: input.durationSec,
    outcome:     input.outcome,
    occurredAt:  input.occurredAt ?? new Date(),
  }).returning()
  return row!
}

export async function listCommunications(filters: { driverId?: string; tripId?: string; alertId?: string; limit?: number }) {
  const conditions = []
  if (filters.driverId) conditions.push(eq(communications.driverId, filters.driverId))
  if (filters.tripId)   conditions.push(eq(communications.tripId,   filters.tripId))
  if (filters.alertId)  conditions.push(eq(communications.alertId,  filters.alertId))

  if (conditions.length === 0) {
    throw new CommError('FILTER_REQUIRED', 'At least one of driverId/tripId/alertId must be provided')
  }
  const where = conditions.length === 1 ? conditions[0] : and(...conditions)
  return db.query.communications.findMany({
    where,
    orderBy: [desc(communications.occurredAt)],
    limit:   filters.limit ?? 100,
  })
}
