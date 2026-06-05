import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:         varchar('name', { length: 100 }).notNull(),
  email:        varchar('email', { length: 150 }).unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  role:         varchar('role', { length: 20 }).notNull(),  // 'admin'|'supervisor'|'analyst'|'viewer'
  isActive:     boolean('is_active').default(true).notNull(),
  // Phase 6 / CONTEXT D-14: per-user severity opt-in for Web Push.
  // Default: only `critico` alerts trigger push; medio/baixo silent.
  // Nullable on purpose — legacy rows pre-Phase-6 may have NULL;
  // backend should fall back to the default object when reading.
  notificationPreferences: jsonb('notification_preferences').default({ critico: true, medio: false, baixo: false }),
  // Phase 12 — presença de operador (heartbeat) p/ "Fila de Operadores" online
  lastSeenAt:   timestamp('last_seen_at', { withTimezone: true }),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type SelectUser = typeof users.$inferSelect
export type InsertUser = typeof users.$inferInsert
