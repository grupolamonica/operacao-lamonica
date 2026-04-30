import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { drivers } from './drivers'

export const vehicles = pgTable('vehicles', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  plate:       varchar('plate', { length: 10 }).unique().notNull(),  // ABC-1234 or ABC-1D23
  type:        varchar('type', { length: 30 }),                       // Van, Furgão, VUC
  model:       varchar('model', { length: 50 }),
  driverId:    uuid('driver_id').references(() => drivers.id),
  gpsDeviceId: varchar('gps_device_id', { length: 50 }),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type SelectVehicle = typeof vehicles.$inferSelect
export type InsertVehicle = typeof vehicles.$inferInsert
