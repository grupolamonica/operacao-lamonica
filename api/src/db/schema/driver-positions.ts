import { pgTable, uuid, text, varchar, numeric, boolean, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Posições importadas da planilha Viagens.xlsx (Phase 10).
 *
 * Cada linha = posição de 1 motorista num timestamp específico.
 * Chave de idempotência: UNIQUE(motorista_norm, data_posicao) — re-import
 * do mesmo arquivo não duplica; export novo (timestamps novos) appenda.
 *
 * Coluna `geom geometry(Point,4326)` NÃO está aqui — é gerenciada via SQL
 * manual (api/drizzle/postgis-driver-positions.sql). drizzle-kit NUNCA
 * deve push/gerir essa coluna (dropa o geom — ver STATE known issue).
 *
 * lat/lng numeric: redundantes p/ leitura simples no front (D-10-02).
 * motorista_norm: upper+trim+strip-acentos — habilita join c/ ranking (D-10-06).
 * geocoded flag: best-effort (D-10-01) — false se Nominatim falhou.
 *
 * @see api/drizzle/postgis-driver-positions.sql — adiciona geom + GIST após drizzle criar a tabela base
 * @see D-10-02, D-10-03, D-10-04, D-10-06 em 10-CONTEXT.md
 */
export const driverPositions = pgTable('driver_positions', {
  id:            uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  motorista:     text('motorista').notNull(),
  motoristaNorm: text('motorista_norm').notNull(),
  dataPosicao:   timestamp('data_posicao', { withTimezone: true }).notNull(),
  posicaoRaw:    text('posicao_raw').notNull(),
  veiculo:       text('veiculo'),
  cidade:        text('cidade'),
  uf:            varchar('uf', { length: 2 }),
  lat:           numeric('lat', { precision: 10, scale: 7 }),
  lng:           numeric('lng', { precision: 10, scale: 7 }),
  geocoded:      boolean('geocoded').notNull().default(false),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  motoristaNormDataUnique: unique('driver_positions_motorista_norm_data_posicao_unique')
    .on(t.motoristaNorm, t.dataPosicao),
  motoristaNormIdx: index('idx_driver_positions_motorista_norm').on(t.motoristaNorm),
}))

export type SelectDriverPosition = typeof driverPositions.$inferSelect
export type InsertDriverPosition = typeof driverPositions.$inferInsert
