import { pgTable, uuid, varchar, timestamp, jsonb, decimal, text, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { trips } from './trips'
import { geofences } from './geofences'
import { users } from './users'

// Trip Events — operational timeline source of truth.
// One row per discrete event in a trip lifecycle. Aggregated with alerts/treatments
// at read-time to produce the unified timeline shown in the UI.
export const tripEvents = pgTable('trip_events', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tripId:      uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
  // Canonical event taxonomy — keep in sync with TimelineEventType on frontend.
  // load_started/finished, departed, in_route, stopped, resumed, deviation,
  // geofence_entered, geofence_exited, arrived_client, unload_started,
  // unload_finished, closed, manual_note.
  eventType:   varchar('event_type', { length: 32 }).notNull(),
  occurredAt:  timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  lat:         decimal('lat', { precision: 10, scale: 8 }),
  lng:         decimal('lng', { precision: 11, scale: 8 }),
  // Reference to geofence when eventType is geofence_*. Nullable otherwise.
  geofenceId:  uuid('geofence_id').references(() => geofences.id, { onDelete: 'set null' }),
  // Free-form note, used for manual entries and tratativas.
  notes:       text('notes'),
  // Flexible bag for event-specific payload (durationMin, speedKmh, deviationKm, etc).
  metadata:    jsonb('metadata').$type<Record<string, unknown>>(),
  // Manual events are attributed to a user; auto-detected events are null.
  createdBy:   uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tripIdx:       index('idx_trip_events_trip').on(t.tripId, t.occurredAt),
  eventTypeIdx:  index('idx_trip_events_type').on(t.eventType),
}))

export type SelectTripEvent = typeof tripEvents.$inferSelect
export type InsertTripEvent = typeof tripEvents.$inferInsert
