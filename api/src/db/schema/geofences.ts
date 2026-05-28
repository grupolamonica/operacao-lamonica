import { pgTable, uuid, varchar, jsonb, timestamp, boolean, text } from 'drizzle-orm/pg-core'

// GeoJSON Polygon stored as JSONB — PostGIS geometry for spatial queries via raw SQL
export const geofences = pgTable('geofences', {
  id:          uuid('id').primaryKey().defaultRandom(),
  name:        varchar('name', { length: 100 }).notNull(),
  type:        varchar('type', { length: 30 }).notNull().default('zona_restrita'),
  // 'zona_restrita' | 'zona_perigo' | 'zona_operacao' | 'checkpoint'
  color:       varchar('color', { length: 20 }).notNull().default('#ef4444'),
  coordinates: jsonb('coordinates').notNull(),
  // GeoJSON Polygon geometry: { type: 'Polygon', coordinates: [[[lng,lat],...]] }
  isActive:    boolean('is_active').notNull().default(true),
  description: text('description'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Geofence = typeof geofences.$inferSelect
export type NewGeofence = typeof geofences.$inferInsert

// Geofence events — entry/exit history
export const geofenceEvents = pgTable('geofence_events', {
  id:          uuid('id').primaryKey().defaultRandom(),
  geofenceId:  uuid('geofence_id').notNull().references(() => geofences.id, { onDelete: 'cascade' }),
  vehicleId:   uuid('vehicle_id').notNull(),
  tripId:      uuid('trip_id'),
  eventType:   varchar('event_type', { length: 10 }).notNull(), // 'entry' | 'exit'
  lat:         varchar('lat', { length: 20 }).notNull(),
  lng:         varchar('lng', { length: 20 }).notNull(),
  occurredAt:  timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
})

export type GeofenceEvent = typeof geofenceEvents.$inferSelect
