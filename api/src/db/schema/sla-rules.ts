import { pgTable, uuid, varchar, smallint, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { clients } from './clients'

// SLA rule resolution: most-specific match wins.
//   1. client_id = trip.clientId         → client-specific override
//   2. client_id IS NULL                 → global default
// Within each level, only `active=true` rules are considered.
export const slaRules = pgTable('sla_rules', {
  id:                   uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:                 varchar('name', { length: 100 }).notNull(),
  // null = global default; non-null = client-specific override
  clientId:             uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  // % of window elapsed before raising "em_risco"
  warningPct:           smallint('warning_pct').notNull().default(80),
  // Minutes of grace after windowEnd before declaring "quebrado"
  breachGraceMinutes:   smallint('breach_grace_minutes').notNull().default(0),
  // Minutes past windowEnd that trigger contractual fine alert (optional)
  fineThresholdMinutes: smallint('fine_threshold_minutes'),
  active:               boolean('active').notNull().default(true),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  clientIdx: index('idx_sla_rules_client').on(t.clientId),
  activeIdx: index('idx_sla_rules_active').on(t.active),
}))

export type SelectSlaRule = typeof slaRules.$inferSelect
export type InsertSlaRule = typeof slaRules.$inferInsert
