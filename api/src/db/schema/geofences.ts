import { pgTable, uuid, varchar, jsonb, timestamp, boolean, text, integer, doublePrecision } from 'drizzle-orm/pg-core'

// GeoJSON Polygon stored as JSONB — PostGIS geometry for spatial queries via raw SQL
export const geofences = pgTable('geofences', {
  id:          uuid('id').primaryKey().defaultRandom(),
  name:        varchar('name', { length: 100 }).notNull(),
  type:        varchar('type', { length: 30 }).notNull().default('zona_restrita'),
  // 'zona_restrita' | 'zona_perigo' | 'zona_operacao' | 'checkpoint' | 'doca'
  color:       varchar('color', { length: 20 }).notNull().default('#ef4444'),
  coordinates: jsonb('coordinates').notNull(),
  // GeoJSON Polygon geometry: { type: 'Polygon', coordinates: [[[lng,lat],...]] }
  isActive:    boolean('is_active').notNull().default(true),
  description: text('description'),
  // Docas SPX (type 'doca', source 'spx'): geofence circular por estação.
  // station_id = SPX station id (único quando setado); centro + raio da cerca virtual.
  stationId:   integer('station_id'),
  radiusM:     integer('radius_m'),
  centerLat:   doublePrecision('center_lat'),
  centerLng:   doublePrecision('center_lng'),
  source:      varchar('source', { length: 10 }).notNull().default('manual'), // 'manual' | 'spx'
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
