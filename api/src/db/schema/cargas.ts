import { pgTable, uuid, text, varchar, numeric, integer, timestamp, index } from 'drizzle-orm/pg-core'

/**
 * Cache local das cargas em aberto + candidatos (Phase 14).
 *
 * Snapshot materializado pelo sync (cargas.service.syncCargas) a partir do
 * Supabase de Cargas. Permite a Torre listar/filtrar offline e cruzar com
 * trips/drivers. É um CACHE (replace a cada sync) — não é fonte de verdade.
 *
 * Tabelas criadas via SQL ADITIVO (api/drizzle/phase14-cargas.sql,
 * CREATE TABLE IF NOT EXISTS) — drizzle-kit NÃO deve push/gerir (regra do
 * projeto: nada de db:push no PROD, protege a geom — ver torre-controle-db-drift).
 */

export const cargasOpenLoads = pgTable('cargas_open_loads', {
  id:              uuid('id').primaryKey(),                 // = cargas.id
  lh:              varchar('lh', { length: 50 }),
  cliente:         varchar('cliente', { length: 80 }),
  origem:          text('origem'),
  destino:         text('destino'),
  perfil:          varchar('perfil', { length: 30 }),
  valor:           numeric('valor'),
  bonus:           numeric('bonus'),
  status:          varchar('status', { length: 20 }).notNull(),
  distanciaKm:     numeric('distancia_km'),
  candidatesCount: integer('candidates_count').default(0).notNull(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusIdx: index('idx_cargas_open_loads_status').on(t.status),
}))

export const cargasLoadCandidates = pgTable('cargas_load_candidates', {
  id:            uuid('id').primaryKey(),                   // = lead/claim id
  loadId:        uuid('load_id').notNull(),
  origin:        varchar('origin', { length: 10 }).notNull(),  // lead | claim
  driverCpf:     varchar('driver_cpf', { length: 14 }),
  driverNome:    text('driver_nome'),
  horsePlate:    varchar('horse_plate', { length: 12 }),
  trailerPlate:  varchar('trailer_plate', { length: 12 }),
  vehicleType:   varchar('vehicle_type', { length: 30 }),
  queuePosition: integer('queue_position'),
  status:        varchar('status', { length: 20 }).notNull(),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  loadIdx: index('idx_cargas_load_candidates_load').on(t.loadId),
}))

export type SelectCargasOpenLoad = typeof cargasOpenLoads.$inferSelect
export type InsertCargasOpenLoad = typeof cargasOpenLoads.$inferInsert
export type SelectCargasLoadCandidate = typeof cargasLoadCandidates.$inferSelect
export type InsertCargasLoadCandidate = typeof cargasLoadCandidates.$inferInsert
