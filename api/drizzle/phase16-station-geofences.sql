-- Phase 16 — docas SPX (carregamento/descarga) como geofences de estação.
-- Cada estação SPX (station_id) vira um geofence circular (centro + raio) no mesmo
-- sistema de geofence da Torre. Preenchido pelo job/adapter spx-geofences (check_info_log).
--
-- Migration ADITIVA e idempotente. Aplicada MANUALMENTE (psql / SQL Editor / MCP Supabase),
-- NUNCA via drizzle-kit push — protege a coluna PostGIS geom de geofences (ver torre-controle-db-drift).
--
-- Aplicar (a partir de api/, lendo DATABASE_URL do .env):
--   psql "$DATABASE_URL" -f drizzle/phase16-station-geofences.sql
-- ou colar no SQL Editor do Supabase / usar o MCP execute_sql.

ALTER TABLE geofences ADD COLUMN IF NOT EXISTS station_id integer;
ALTER TABLE geofences ADD COLUMN IF NOT EXISTS radius_m   integer;
ALTER TABLE geofences ADD COLUMN IF NOT EXISTS center_lat double precision;
ALTER TABLE geofences ADD COLUMN IF NOT EXISTS center_lng double precision;
ALTER TABLE geofences ADD COLUMN IF NOT EXISTS source     varchar(10) NOT NULL DEFAULT 'manual';

-- Unicidade por estação (só para docas SPX; zonas manuais têm station_id NULL).
-- Índice parcial → também é o alvo do ON CONFLICT (station_id) WHERE station_id IS NOT NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_geofences_station_id
  ON geofences (station_id) WHERE station_id IS NOT NULL;
