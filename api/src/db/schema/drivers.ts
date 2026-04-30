import { pgTable, uuid, varchar, integer, timestamp, text, decimal } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const drivers = pgTable('drivers', {
  id:               uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  code:             varchar('code', { length: 20 }).unique().notNull(),
  name:             varchar('name', { length: 100 }).notNull(),
  phone:            varchar('phone', { length: 20 }),
  email:            varchar('email', { length: 150 }),
  photoUrl:         text('photo_url'),
  status:           varchar('status', { length: 20 }).default('available').notNull(),  // available|on_route|unavailable
  operationalScore: integer('operational_score').default(100).notNull(),
  base:             varchar('base', { length: 50 }),                                   // 'CD São Paulo' etc
  deliveriesToday:  integer('deliveries_today').default(0).notNull(),
  avgDelayMinutes:  integer('avg_delay_minutes').default(0).notNull(),                 // pode ser negativo
  lat:              decimal('lat', { precision: 10, scale: 8 }),
  lng:              decimal('lng', { precision: 11, scale: 8 }),
  address:          text('address'),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type SelectDriver = typeof drivers.$inferSelect
export type InsertDriver = typeof drivers.$inferInsert
