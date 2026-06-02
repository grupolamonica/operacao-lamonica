import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { drivers } from './drivers'
import { trips } from './trips'
import { alerts } from './alerts'
import { users } from './users'

// Operational communications log. One row per call/sms/whatsapp/note.
// At least one of driver_id / trip_id / alert_id should be set (enforced at
// service layer, not DB — see communications.service.ts).
export const communications = pgTable('communications', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  driverId:    uuid('driver_id').references(() => drivers.id, { onDelete: 'set null' }),
  tripId:      uuid('trip_id').references(() => trips.id, { onDelete: 'set null' }),
  alertId:     uuid('alert_id').references(() => alerts.id, { onDelete: 'set null' }),
  operatorId:  uuid('operator_id').references(() => users.id, { onDelete: 'set null' }),
  // channel = call | sms | whatsapp | note
  channel:     varchar('channel', { length: 20 }).notNull(),
  // direction = out (operator → driver) | in (driver → operator)
  direction:   varchar('direction', { length: 10 }).notNull().default('out'),
  content:     text('content'),
  durationSec: integer('duration_sec'),
  // outcome = atendida | nao_atendida | caixa_postal | enviada | recebida | null
  outcome:     varchar('outcome', { length: 20 }),
  occurredAt:  timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  driverIdx:   index('idx_comm_driver').on(t.driverId, t.occurredAt),
  tripIdx:     index('idx_comm_trip').on(t.tripId, t.occurredAt),
  alertIdx:    index('idx_comm_alert').on(t.alertId, t.occurredAt),
  occurredIdx: index('idx_comm_occurred').on(t.occurredAt),
}))

export type SelectCommunication = typeof communications.$inferSelect
export type InsertCommunication = typeof communications.$inferInsert
