import { pgTable, uuid, varchar, text, date, numeric, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * KM rodado por viagem por dia (Phase 12) — porte da aba HistoricoDiario do painel GAS.
 * 1 linha por (viagem, dia): km restante no início/fim do dia + km rodado.
 * Chave de idempotência: UNIQUE(trip_code, dia).
 */
export const tripDailyKm = pgTable('trip_daily_km', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tripCode:   varchar('trip_code', { length: 20 }).notNull(),
  motorista:  text('motorista'),
  dia:        date('dia').notNull(),
  kmInicial:  numeric('km_inicial'),
  kmFinal:    numeric('km_final'),
  kmRodado:   numeric('km_rodado'),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  codeDiaUnique: unique('trip_daily_km_code_dia_unique').on(t.tripCode, t.dia),
  codeIdx:       index('idx_trip_daily_km_code').on(t.tripCode),
}))

export type SelectTripDailyKm = typeof tripDailyKm.$inferSelect
export type InsertTripDailyKm = typeof tripDailyKm.$inferInsert
