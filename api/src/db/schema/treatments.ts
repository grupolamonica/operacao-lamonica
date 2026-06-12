import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { alerts } from './alerts'
import { trips } from './trips'
import { users } from './users'

export const treatments = pgTable('treatments', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  alertId:    uuid('alert_id').references(() => alerts.id),
  tripId:     uuid('trip_id').references(() => trips.id),
  operatorId: uuid('operator_id').references(() => users.id),
  actionType: varchar('action_type', { length: 50 }),
  // 'assumiu'|'registrou_tratativa'|'ligou_motorista'|'escalou'|'resolveu'
  notes:      text('notes'),
  outcome:    varchar('outcome', { length: 30 }),  // pendente|resolvido|escalado
  // Phase 14 — autor externo (operador do painel GAS: Filipe, Kevin, SISTEMA...).
  // operatorId fica NULL nesses casos; o nome de quem mandou a mensagem vem aqui.
  authorName: varchar('author_name', { length: 120 }),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type SelectTreatment = typeof treatments.$inferSelect
export type InsertTreatment = typeof treatments.$inferInsert
