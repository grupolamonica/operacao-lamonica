import { pgTable, uuid, varchar, smallint, timestamp, decimal, jsonb, index, integer, text } from 'drizzle-orm/pg-core'
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
  // Prazo Final. NULLABLE (trips-window-end-nullable.sql): closeStaleTrips() zera o prazo-lixo
  // das cargas (data da carga à meia-noite, vencida, sem GPS); o reconcile repõe o prazo real.
  windowEnd:      timestamp('window_end', { withTimezone: true }),
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
  // Phase 12 (migration 0003) — rastreabilidade DBLH + ponte Shopee/ranking
  ordemViagem:     integer('ordem_viagem'),
  sheetLh:         varchar('sheet_lh', { length: 50 }),
  sheetMotorista:  text('sheet_motorista'),
  sheetCavalo:     varchar('sheet_cavalo', { length: 12 }),
  sheetCarreta:    varchar('sheet_carreta', { length: 12 }),
  valor:           decimal('valor', { precision: 10, scale: 2 }),
  bonus:           decimal('bonus', { precision: 10, scale: 2 }),
  // Phase 12 — morosidade (atraso na origem, horas) — ajusta o prazo no cálculo de SLA (porte do painel GAS)
  morosidadeHoras: decimal('morosidade_horas'),
  // Phase 13 — paridade painel: regime de condução + atraso computado (lei do motorista)
  conducaoRegime:    varchar('conducao_regime', { length: 12 }).default('intensivo'),  // intensivo|regular
  adiantamentoHoras: decimal('adiantamento_horas'),                                    // horas; + = ATRASADO (convenção do painel)
  // Phase 13 — origem do registro. 'painel' = snapshot importado do export do painel GAS (verdade do painel).
  source:            varchar('source', { length: 20 }),
  shopeeDriverId:  text('shopee_driver_id'),
  statusEta:       varchar('status_eta', { length: 20 }),
  statusCpt:       varchar('status_cpt', { length: 20 }),
  usedVehicleType: varchar('used_vehicle_type', { length: 30 }),
  rankingScore:    jsonb('ranking_score'),
  // Phase 14 — status operacional do Cargas (sheet_status) + id da carga de origem
  cargasStatus:    varchar('cargas_status', { length: 40 }),   // DESCARREGADO|AGUARDANDO ...|CTE ENVIADO ... (10 valores)
  cargasLoadId:    uuid('cargas_load_id'),
  // Phase 14 — elo NÃO-único p/ fundir viagem-painel (PNLA, dona do code) + carga (CRG, dona do sheet_lh único)
  linkedLh:        varchar('linked_lh', { length: 50 }),
  // P5 — identidade CANÔNICA da viagem física (LH, ou motorista-ativo, ou própria id). Mesma viagem
  // representada em painel(PNLA)+cargas(CRG) compartilha a chave → dedup consistente em toda contagem.
  // Derivada (recomputada por recomputeCanonicalKeys), não brigam com os syncs.
  canonicalKey:    text('canonical_key'),
  createdAt:      timestamp('created_at',  { withTimezone: true }).defaultNow().notNull(),
  updatedAt:      timestamp('updated_at',  { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusIdx:    index('idx_trips_status').on(t.status),
  slaStatusIdx: index('idx_trips_sla_status').on(t.slaStatus),
  windowIdx:    index('idx_trips_window').on(t.windowStart, t.windowEnd),
  riskIdx:      index('idx_trips_risk_level').on(t.riskLevel),
  canonicalIdx: index('idx_trips_canonical_key').on(t.canonicalKey),
}))

export type SelectTrip = typeof trips.$inferSelect
export type InsertTrip = typeof trips.$inferInsert
