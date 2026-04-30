import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const clients = pgTable('clients', {
  id:   uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull(),
  code: varchar('code', { length: 20 }).unique(),
})

export type SelectClient = typeof clients.$inferSelect
export type InsertClient = typeof clients.$inferInsert
