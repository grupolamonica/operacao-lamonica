import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { clients } from './clients'

export const routes = pgTable('routes', {
  id:       uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  code:     varchar('code', { length: 20 }).unique().notNull(),
  name:     varchar('name', { length: 100 }),
  clientId: uuid('client_id').references(() => clients.id),
  region:   varchar('region', { length: 50 }),
})

export type SelectRoute = typeof routes.$inferSelect
export type InsertRoute = typeof routes.$inferInsert
