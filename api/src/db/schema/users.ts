import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:         varchar('name', { length: 100 }).notNull(),
  email:        varchar('email', { length: 150 }).unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  role:         varchar('role', { length: 20 }).notNull(),  // 'admin'|'supervisor'|'analyst'|'viewer'
  isActive:     boolean('is_active').default(true).notNull(),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type SelectUser = typeof users.$inferSelect
export type InsertUser = typeof users.$inferInsert
