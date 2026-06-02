import { pgTable, uuid, varchar, integer, text, timestamp, decimal, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { trips } from './trips'
import { drivers } from './drivers'
import { vehicles } from './vehicles'
import { users } from './users'

export const alerts = pgTable('alerts', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  type:         varchar('type', { length: 50 }).notNull(),
  // type values: 'atraso_critico'|'desvio_nao_autorizado'|'parada_nao_planejada'
  // |'sinal_gps_intermitente'|'tempo_parada_elevado'|'entrega_fora_janela'|'checklist_incompleto'
  severity:     varchar('severity', { length: 10 }).notNull(),    // critico|medio|baixo
  // Workflow state machine (Sprint 2):
  //   aberto → em_analise → em_tratativa → resolvido → encerrado
  // Backwards-compatible: legacy rows in (aberto|em_tratativa|resolvido) still valid.
  status:       varchar('status', { length: 15 }).default('aberto').notNull(),
  priority:     varchar('priority', { length: 10 }).default('media').notNull(), // alta|media|baixa
  tripId:       uuid('trip_id').references(() => trips.id),
  driverId:     uuid('driver_id').references(() => drivers.id),
  vehicleId:    uuid('vehicle_id').references(() => vehicles.id),
  assignedTo:   uuid('assigned_to').references(() => users.id),
  title:        varchar('title', { length: 150 }).notNull(),
  description:  text('description'),
  source:       varchar('source', { length: 30 }),               // GPS|Checklist|Telemetria|Manual
  lat:          decimal('lat', { precision: 10, scale: 8 }),
  lng:          decimal('lng', { precision: 11, scale: 8 }),
  delayMinutes: integer('delay_minutes'),
  deviationKm:  decimal('deviation_km', { precision: 6, scale: 2 }),
  occurredAt:   timestamp('occurred_at',  { withTimezone: true }).notNull(),
  resolvedAt:   timestamp('resolved_at',  { withTimezone: true }),
  slaDeadline:  timestamp('sla_deadline', { withTimezone: true }),
  createdAt:    timestamp('created_at',   { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusSeverityIdx: index('idx_alerts_status_severity').on(t.status, t.severity),
  occurredIdx:       index('idx_alerts_occurred').on(t.occurredAt),
}))

export type SelectAlert = typeof alerts.$inferSelect
export type InsertAlert = typeof alerts.$inferInsert
