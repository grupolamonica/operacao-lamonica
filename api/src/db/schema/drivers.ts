import { pgTable, uuid, varchar, integer, timestamp, text, decimal, date, boolean, jsonb } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const drivers = pgTable('drivers', {
  id:               uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  code:             varchar('code', { length: 20 }).unique().notNull(),
  name:             varchar('name', { length: 100 }).notNull(),
  phone:            varchar('phone', { length: 20 }),
  email:            varchar('email', { length: 150 }),
  photoUrl:         text('photo_url'),
  status:           varchar('status', { length: 20 }).default('available').notNull(),  // available|on_route|unavailable
  operationalScore: integer('operational_score').default(100).notNull(),
  base:             varchar('base', { length: 50 }),                                   // 'CD São Paulo' etc
  deliveriesToday:  integer('deliveries_today').default(0).notNull(),
  avgDelayMinutes:  integer('avg_delay_minutes').default(0).notNull(),                 // pode ser negativo
  lat:              decimal('lat', { precision: 10, scale: 8 }),
  lng:              decimal('lng', { precision: 11, scale: 8 }),
  address:          text('address'),
  // Phase 12 (migration 0003_lamonica_fields) — catálogo rico MH + Angellira
  cpf:                 varchar('cpf', { length: 14 }),
  cnh:                 varchar('cnh', { length: 20 }),
  cnhValidade:         date('cnh_validade'),
  cnhCategoria:        varchar('cnh_categoria', { length: 5 }),
  rg:                  varchar('rg', { length: 20 }),
  nascimento:          date('nascimento'),
  driverKind:          varchar('driver_kind', { length: 10 }),     // FUN | AGR
  cidade:              varchar('cidade', { length: 80 }),
  estado:              varchar('estado', { length: 2 }),
  trackingEnabled:     boolean('tracking_enabled').default(false),
  documentsValid:      boolean('documents_valid').default(true),
  anttValid:           boolean('antt_valid').default(true),
  insuranceValid:      boolean('insurance_valid').default(false),
  monitoringCapable:   boolean('monitoring_capable').default(false),
  operationalBlocked:  boolean('operational_blocked').default(false),
  allowedRegions:      text('allowed_regions').array(),
  angelliraStatus:     varchar('angellira_status', { length: 40 }),
  angelliraValidUntil: date('angellira_valid_until'),
  shopeeDriverId:      text('shopee_driver_id'),
  rawJson:             jsonb('raw_json'),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type SelectDriver = typeof drivers.$inferSelect
export type InsertDriver = typeof drivers.$inferInsert
