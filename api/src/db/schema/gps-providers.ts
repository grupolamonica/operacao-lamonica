import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core'

/**
 * GPS provider configuration stubs.
 *
 * Phase 6 only persists config (name + base URL + API key). No actual GPS
 * integration is performed in this phase — UI is purely admin-only and
 * prepares the terrain for future provider integration plans.
 *
 * Semantics:
 *  - `defaultRandom()` PK style (matches geofences.ts convention for new tables).
 *  - `baseUrl` / `apiKey` are nullable: a draft row with only `name` is valid.
 *  - `isActive` default true so newly created providers are considered live.
 *
 * @see CONTEXT D-20 (stub only — no runtime integration in Phase 6)
 */
export const gpsProviders = pgTable('gps_providers', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      varchar('name', { length: 100 }).notNull(),
  baseUrl:   text('base_url'),
  apiKey:    text('api_key'),
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type SelectGpsProvider = typeof gpsProviders.$inferSelect
export type InsertGpsProvider = typeof gpsProviders.$inferInsert
