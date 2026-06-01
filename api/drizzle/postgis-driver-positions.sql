-- PostGIS objects for driver_positions NOT managed by Drizzle.
--
-- WHY MANUAL: drizzle-kit push/generate DROPS the `geom` column because
-- Drizzle does not know about PostGIS geometry types. The base table
-- (driver_positions columns without geom) is created by Drizzle migrations.
-- This script adds the spatial column and index AFTER Drizzle has created
-- the base table. See api/drizzle/postgis-manual.sql for the geofences
-- precedent. See STATE.md known issue: drizzle-kit push drops geom.
--
-- Apply ONCE per fresh database, AFTER drizzle has created the base tables:
--
--   psql "$DATABASE_URL_DIRECT" -f api/drizzle/postgis-driver-positions.sql
--
-- Idempotent — safe to re-run (IF NOT EXISTS on all statements).
-- Target: Torre Supabase prod (ocgifdytaqlubuokjkwv, sa-east-1) — PostGIS
-- extension already present from Phase 6 geofences.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE driver_positions ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

CREATE INDEX IF NOT EXISTS idx_driver_positions_geom ON driver_positions USING GIST (geom);
