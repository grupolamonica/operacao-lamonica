import { pgTable, uuid, varchar, text, jsonb, boolean, timestamp, index } from 'drizzle-orm/pg-core'

/**
 * Phase 15 — cruzamento SPX (line_haul trips) x Angellira (gerenciamento de risco) por viagem.
 *
 * Cada linha = uma viagem SPX com veiculo atribuido, validada contra a Angellira
 * pela placa (cavalo + carreta). `angelira_ok=false` => veiculo sem consulta ou
 * com consulta vencida (furo de risco). `alert_flag` marca que ja gerou ocorrencia.
 *
 * Tabela criada via SQL ADITIVO (api/drizzle/phase15-spx-trip-check.sql,
 * CREATE TABLE IF NOT EXISTS) — drizzle-kit NAO deve push/gerir (protege a geom
 * PostGIS de geofences; ver memoria torre-controle-db-drift).
 */
export const spxTripCheck = pgTable('spx_trip_check', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tripNumber:   varchar('trip_number', { length: 50 }).notNull().unique(),
  tripName:     varchar('trip_name', { length: 120 }),
  origem:       varchar('origem', { length: 120 }),
  destino:      varchar('destino', { length: 120 }),
  motorista:    varchar('motorista', { length: 120 }),
  cavalo:       varchar('cavalo', { length: 16 }),
  carreta:      varchar('carreta', { length: 16 }),
  tripStatus:   varchar('trip_status', { length: 30 }),
  placas:       jsonb('placas').$type<{ placa: string; tipo: string; achada: boolean | null; status: string | null; vencida: boolean | null }[]>(),
  angeliraOk:   boolean('angelira_ok').default(false).notNull(),
  vencida:      boolean('vencida').default(false).notNull(),
  detalhe:      text('detalhe'),
  alertFlag:    boolean('alert_flag').default(false).notNull(),
  checkedAt:    timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  alertIdx:  index('idx_spx_trip_check_alert').on(t.alertFlag),
  okIdx:     index('idx_spx_trip_check_ok').on(t.angeliraOk),
}))

export type SelectSpxTripCheck = typeof spxTripCheck.$inferSelect
export type InsertSpxTripCheck = typeof spxTripCheck.$inferInsert
