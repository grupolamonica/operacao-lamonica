import { pgTable, text, varchar, numeric, timestamp } from 'drizzle-orm/pg-core'

/**
 * Cache de resultados de geocoding (D-10-08).
 *
 * Chave: `query` (string normalizada enviada ao Nominatim) — PK = idempotência
 * de geocoding. Re-import não rebate no Nominatim para queries já resolvidas.
 *
 * lat/lng nullable: cache de miss é representado por NULL lat/lng (geocode falhou,
 * mas a query foi tentada — não tenta de novo).
 *
 * ToS compliance: User-Agent custom + rate-limit 1/s sequencial no geocoder;
 * cache-first (só bate em miss); sem bulk (T3 em 10-CONTEXT threat_model).
 *
 * @see D-10-01 (Nominatim/OSM fuzzy + cache) em 10-CONTEXT.md
 * @see D-10-08 (geocode_cache table spec)
 */
export const geocodeCache = pgTable('geocode_cache', {
  query:       text('query').primaryKey(),
  lat:         numeric('lat', { precision: 10, scale: 7 }),
  lng:         numeric('lng', { precision: 10, scale: 7 }),
  cidade:      text('cidade'),
  uf:          varchar('uf', { length: 2 }),
  displayName: text('display_name'),
  provider:    text('provider').notNull().default('nominatim'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type SelectGeocodeCache = typeof geocodeCache.$inferSelect
export type InsertGeocodeCache = typeof geocodeCache.$inferInsert
