-- PostGIS objects NOT managed by Drizzle (drizzle-kit ignores the `geom` column
-- and the postgis extension). Apply ONCE per fresh database, AFTER drizzle has
-- created the base tables.
--
--   psql "$DATABASE_URL_DIRECT" -f api/drizzle/postgis-manual.sql
--
-- Idempotent — safe to re-run. Already applied to the Supabase prod project
-- (ocgifdytaqlubuokjkwv) via Supabase MCP on 2026-05-29.
--
-- WHY MANUAL: api/src/db/schema/geofences.ts stores the polygon as JSONB
-- (`coordinates`) for the API contract, but spatial containment queries
-- (ST_Contains) need a real PostGIS geometry column. The backend keeps `geom`
-- in sync via raw SQL (geofences.plugin.ts). drizzle-kit MUST NOT push/manage
-- this column — `drizzle-kit push` would DROP it. Schema changes go through
-- `drizzle-kit generate` (reviewed SQL) — never auto-push in CI.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE geofences ADD COLUMN IF NOT EXISTS geom geometry(Polygon, 4326);

CREATE INDEX IF NOT EXISTS idx_geofences_geom ON geofences USING GIST (geom);
