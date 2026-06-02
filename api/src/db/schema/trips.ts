import { pgTable, uuid, varchar, smallint, timestamp, decimal, jsonb, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { drivers } from './drivers'
import { vehicles } from './vehicles'
import { clients } from './clients'
import { routes } from './routes'

export const trips = pgTable('trips', {
  id:             uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  code:           varchar('code', { length: 20 }).unique().notNull(),
  driverId:       uuid('driver_id').references(() => drivers.id),
  vehicleId:      uuid('vehicle_id').references(() => vehicles.id),
  clientId:       uuid('client_id').references(() => clients.id),
  routeId:        uuid('route_id').references(() => routes.id),
  priority:       varchar('priority', { length: 10 }).default('media').notNull(),         // alta|media|baixa
  origin:         varchar('origin', { length: 200 }),
  destination:    varchar('destination', { length: 200 }),
  originLat:      decimal('origin_lat', { precision: 10, scale: 8 }),
  originLng:      decimal('origin_lng', { precision: 11, scale: 8 }),
  destLat:        decimal('dest_lat', { precision: 10, scale: 8 }),
  destLng:        decimal('dest_lng', { precision: 11, scale: 8 }),
  windowStart:    timestamp('window_start', { withTimezone: true }).notNull(),
  windowEnd:      timestamp('window_end', { withTimezone: true }).notNull(),
  eta:            timestamp('eta', { withTimezone: true }),
  status:         varchar('status', { length: 20 }).default('planned').notNull(),         // planned|in_progress|completed|delayed|cancelled
  slaStatus:      varchar('sla_status', { length: 20 }),                                  // no_prazo|em_risco|atrasado|sem_sinal
  progressPct:    smallint('progress_pct').default(0).notNull(),
  distanceTotal:  decimal('distance_total', { precision: 8, scale: 2 }),                  // km
  distanceDone:   decimal('distance_done',  { precision: 8, scale: 2 }),
  departedAt:     timestamp('departed_at', { withTimezone: true }),
  arrivedAt:      timestamp('arrived_at',  { withTimezone: true }),
  // Sprint 3 — Delivery risk engine snapshot. Recomputed on every position
  // update by risk.service.recalcTripRisk(). riskFactors carries the
  // per-factor breakdown for the UI to explain the score.
  riskScore:          smallint('risk_score'),
  riskLevel:          varchar('risk_level', { length: 10 }),    // baixo|medio|alto|critico
  riskFactors:        jsonb('risk_factors').$type<Array<{ key: string; label: string; weight: number; contribution: number; detail?: string }>>(),
  riskCalculatedAt:   timestamp('risk_calculated_at', { withTimezone: true }),
  createdAt:      timestamp('created_at',  { withTimezone: true }).defaultNow().notNull(),
  updatedAt:      timestamp('updated_at',  { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusIdx:    index('idx_trips_status').on(t.status),
  slaStatusIdx: index('idx_trips_sla_status').on(t.slaStatus),
  windowIdx:    index('idx_trips_window').on(t.windowStart, t.windowEnd),
  riskIdx:      index('idx_trips_risk_level').on(t.riskLevel),
}))

export type SelectTrip = typeof trips.$inferSelect
export type InsertTrip = typeof trips.$inferInsert
