import { pgTable, varchar, integer, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

/**
 * Global alert engine thresholds (key-value).
 *
 * Examples (seeded via api/src/db/seed/index.ts):
 *   atraso_critico_minutes = 30
 *   desvio_km_threshold    = 2
 *   stop_duration_minutes  = 15
 *
 * Read by the alert engine (Phase 4 module) at runtime — optional in-memory
 * cache of 60 s lives in api/src/modules/thresholds (Wave 1, plan 06-05).
 *
 * Editable only by users with role='admin' (enforced at plugin layer).
 *
 * @see CONTEXT D-19 (locked seed values + admin-only writes)
 */
export const alertThresholds = pgTable('alert_thresholds', {
  type:      varchar('type', { length: 50 }).primaryKey(),
  value:     integer('value').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type SelectAlertThreshold = typeof alertThresholds.$inferSelect
export type InsertAlertThreshold = typeof alertThresholds.$inferInsert
