-- Phase 14 — Integração Cargas: migration ADITIVA e idempotente.
-- Aplicada manualmente (NUNCA via drizzle-kit push — protege a geom PostGIS;
-- ver torre-controle-db-drift). Só ADD COLUMN / CREATE TABLE IF NOT EXISTS —
-- nenhum DROP, seguro de re-rodar.

-- trips: status operacional do Cargas (sheet_status) + id da carga de origem
ALTER TABLE trips ADD COLUMN IF NOT EXISTS cargas_status varchar(40);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS cargas_load_id uuid;

-- drivers: enrich do ranking + candidaturas abertas no Cargas (vínculo = driver_kind já existe)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS ranking_pontuacao numeric;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS ranking_posicao integer;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS cargas_candidaturas_abertas integer DEFAULT 0;

-- cache de cargas em aberto (snapshot do sync)
CREATE TABLE IF NOT EXISTS cargas_open_loads (
  id               uuid PRIMARY KEY,
  lh               varchar(50),
  cliente          varchar(80),
  origem           text,
  destino          text,
  perfil           varchar(30),
  valor            numeric,
  bonus            numeric,
  status           varchar(20) NOT NULL,
  distancia_km     numeric,
  candidates_count integer NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cargas_open_loads_status ON cargas_open_loads (status);

-- cache de candidatos por carga
CREATE TABLE IF NOT EXISTS cargas_load_candidates (
  id             uuid PRIMARY KEY,
  load_id        uuid NOT NULL,
  origin         varchar(10) NOT NULL,
  driver_cpf     varchar(14),
  driver_nome    text,
  horse_plate    varchar(12),
  trailer_plate  varchar(12),
  vehicle_type   varchar(30),
  queue_position integer,
  status         varchar(20) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cargas_load_candidates_load ON cargas_load_candidates (load_id);
