-- Phase 15 — cruzamento SPX (line_haul trips) x Angellira (gerenciamento de risco) por viagem.
-- Migration ADITIVA e idempotente. Aplicada MANUALMENTE (psql / SQL Editor / MCP Supabase),
-- NUNCA via drizzle-kit push — protege a coluna PostGIS geom de geofences (ver torre-controle-db-drift).
--
-- Aplicar (a partir de api/, lendo DATABASE_URL do .env):
--   psql "$DATABASE_URL" -f drizzle/phase15-spx-trip-check.sql
-- ou colar no SQL Editor do Supabase / usar o MCP execute_sql.

CREATE TABLE IF NOT EXISTS spx_trip_check (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_number   varchar(50)  NOT NULL UNIQUE,
  trip_name     varchar(120),
  origem        varchar(120),
  destino       varchar(120),
  motorista     varchar(120),
  cavalo        varchar(16),
  carreta       varchar(16),
  trip_status   varchar(30),
  placas        jsonb,
  angelira_ok   boolean      NOT NULL DEFAULT false,
  vencida       boolean      NOT NULL DEFAULT false,
  detalhe       text,
  alert_flag    boolean      NOT NULL DEFAULT false,
  checked_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spx_trip_check_alert ON spx_trip_check (alert_flag);
CREATE INDEX IF NOT EXISTS idx_spx_trip_check_ok    ON spx_trip_check (angelira_ok);
