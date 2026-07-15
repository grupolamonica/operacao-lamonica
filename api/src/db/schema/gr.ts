import { pgTable, uuid, text, varchar, boolean, date, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * Cache local das vigências de risco (Angellira/BRK/SPX) por entidade — GR.
 *
 * Snapshot materializado pelo sync do módulo gr (gr.sync.syncGr) a partir do
 * Supabase de Cargas (driver_profiles + vehicles). É CACHE (replace a cada sync)
 * — não é fonte de verdade.
 *
 * Tabela criada via SQL ADITIVO (api/drizzle/gr.sql, CREATE TABLE IF NOT EXISTS)
 * — drizzle-kit NÃO deve push/gerir (regra do projeto: nada de db:push no PROD,
 * ver torre-controle-db-drift). Declarada aqui só para tipos/reads.
 */
export const grVigencias = pgTable('gr_vigencias', {
  id:              uuid('id').primaryKey().defaultRandom(),
  entityType:      varchar('entity_type', { length: 10 }).notNull(),   // 'driver' | 'vehicle'
  entityKey:       varchar('entity_key', { length: 20 }).notNull(),    // CPF | placa (normalizado)
  displayName:     text('display_name'),
  plateRole:       varchar('plate_role', { length: 12 }),
  provider:        varchar('provider', { length: 12 }).notNull(),      // 'angellira' | 'brk' | 'spx'
  rawStatus:       text('raw_status'),
  statusText:      text('status_text'),
  validUntil:      date('valid_until'),
  conjuntoApto:    boolean('conjunto_apto'),
  status:          varchar('status', { length: 14 }).notNull(),        // OK | EXPIRING_SOON | EXPIRED | STATE | UNKNOWN
  daysUntilExpiry: integer('days_until_expiry'),
  checkedAt:       timestamp('checked_at', { withTimezone: true }),
  linkedDriverCpf: varchar('linked_driver_cpf', { length: 14 }),
  source:          varchar('source', { length: 10 }).default('cargas').notNull(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  entityProviderIdx: uniqueIndex('ux_gr_vigencias_entity_provider').on(t.entityType, t.entityKey, t.provider),
  statusIdx:         index('idx_gr_vigencias_status').on(t.status),
  entityIdx:         index('idx_gr_vigencias_entity').on(t.entityType),
}))

export type SelectGrVigencia = typeof grVigencias.$inferSelect
export type InsertGrVigencia = typeof grVigencias.$inferInsert
