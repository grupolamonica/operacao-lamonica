---
phase: 10-importa-o-viagens-xlsx-db-torre-ingestion
plan: "01"
subsystem: db-schema
tags: [drizzle, postgis, schema, ingestion, driver-positions, geocode-cache]
dependency_graph:
  requires: []
  provides:
    - driverPositions table (driver_positions) with UNIQUE(motorista_norm, data_posicao)
    - geocodeCache table (geocode_cache) with query PK
    - postgis-driver-positions.sql (geom Point 4326 + GIST, idempotente)
  affects:
    - api/src/db/schema/index.ts (barrel)
    - Plan 10-02 (parser imports driverPositions)
    - Plan 10-03 (geocoder imports geocodeCache)
    - Plan 10-04 (endpoint + upsert ON CONFLICT)
tech_stack:
  added: []
  patterns:
    - drizzle-orm pgTable + unique() composto + index()
    - PostGIS coluna geom via SQL manual (padrão postgis-manual.sql)
    - Schema sem geom no Drizzle (previne drizzle-kit push dropa coluna)
key_files:
  created:
    - api/src/db/schema/driver-positions.ts
    - api/src/db/schema/geocode-cache.ts
    - api/drizzle/postgis-driver-positions.sql
  modified:
    - api/src/db/schema/index.ts
decisions:
  - "geom NOT in Drizzle schema — SQL manual only (D-10-02, T-10-01, STATE known issue)"
  - "UNIQUE(motorista_norm, data_posicao) — idempotência de re-import (D-10-04)"
  - "lat/lng numeric redundantes para leitura no front sem PostGIS (D-10-02)"
  - "geocode_cache.query PK — idempotência de geocoding + ToS-friendly (D-10-08)"
  - "SQL aplicação deferida: sem psql nem DATABASE_URL_DIRECT no sandbox; aplicar no checkpoint live do 10-04"
metrics:
  duration: "~10min"
  completed: "2026-06-01"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 1
---

# Phase 10 Plan 01: Drizzle Schema driver_positions + geocode_cache + PostGIS SQL Summary

**One-liner:** Drizzle schema `driver_positions` (UNIQUE motorista_norm+data_posicao, lat/lng numeric, geocoded flag) + `geocode_cache` (query PK) + SQL manual idempotente `geom geometry(Point,4326)` + GIST — camada de dados pronta para parser/geocoder/endpoint.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Definir tabelas driver_positions + geocode_cache (Drizzle, sem geom) | 8573a78 | api/src/db/schema/driver-positions.ts, api/src/db/schema/geocode-cache.ts |
| 2 | Exportar tabelas novas no barrel do schema | 8573a78 | api/src/db/schema/index.ts |
| 3 | SQL manual PostGIS (geom + GIST) | 8573a78 | api/drizzle/postgis-driver-positions.sql |

## Implementation Details

### driver_positions (api/src/db/schema/driver-positions.ts)

12 colunas (sem `geom`):
- `id` uuid PK gen_random_uuid()
- `motorista` text notNull — nome as-is da planilha
- `motoristaNorm` text('motorista_norm') notNull — upper+trim+strip-acentos (D-10-06, join futuro Phase 11)
- `dataPosicao` timestamptz notNull
- `posicaoRaw` text notNull — sempre gravado mesmo sem geocode
- `veiculo` text nullable
- `cidade` text nullable
- `uf` varchar(2) nullable
- `lat` numeric(10,7) nullable — redundante p/ front (D-10-02)
- `lng` numeric(10,7) nullable — redundante p/ front
- `geocoded` boolean notNull default false — best-effort flag (D-10-01)
- `createdAt` timestamptz notNull defaultNow()

Constraints/indexes:
- `UNIQUE('driver_positions_motorista_norm_data_posicao_unique').on(motoristaNorm, dataPosicao)` — D-10-04
- `index('idx_driver_positions_motorista_norm').on(motoristaNorm)` — join futuro Phase 11

### geocode_cache (api/src/db/schema/geocode-cache.ts)

8 colunas:
- `query` text PK — query normalizada para Nominatim (idempotência D-10-08)
- `lat` numeric(10,7) nullable — NULL = cache de miss
- `lng` numeric(10,7) nullable
- `cidade` text nullable
- `uf` varchar(2) nullable
- `displayName` text('display_name') nullable
- `provider` text notNull default 'nominatim'
- `createdAt` timestamptz notNull defaultNow()

### postgis-driver-positions.sql (api/drizzle/postgis-driver-positions.sql)

Idempotente (IF NOT EXISTS em todas as instruções):
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
ALTER TABLE driver_positions ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);
CREATE INDEX IF NOT EXISTS idx_driver_positions_geom ON driver_positions USING GIST (geom);
```

Comentário no topo explica WHY MANUAL + instrução de invocação via psql.

### Barrel (api/src/db/schema/index.ts)

Adicionadas 2 linhas antes de `./relations`:
```typescript
export * from './driver-positions'
export * from './geocode-cache'
```

## Verification

- `bunx tsc --noEmit` — **0 errors** (api inteiro)
- SQL shape: `geometry(Point, 4326)` + `USING GIST` confirmados via grep

## Deviations from Plan

None — plan executed exactly as written.

## SQL Application Status

**DEFERRED** — psql não disponível no ambiente autônomo; DATABASE_URL aponta para localhost (dev DB), sem acesso ao Torre Supabase prod (`ocgifdytaqlubuokjkwv`). Nenhuma credencial DATABASE_URL_DIRECT no sandbox.

**Ação necessária no checkpoint live do Plan 10-04:**
```bash
psql "$DATABASE_URL_DIRECT" -f api/drizzle/postgis-driver-positions.sql
```
Ou via Supabase MCP (projeto ocgifdytaqlubuokjkwv) — aplicar APÓS o drizzle criar a tabela base `driver_positions`.

O SQL é idempotente — seguro re-aplicar se a tabela já existir.

## Threat Flags

Nenhum — todas as superfícies cobertas pelo threat_model do plano (T-10-01, T-10-04, T-10-05).

## Self-Check

- [x] api/src/db/schema/driver-positions.ts — FOUND, commit 8573a78
- [x] api/src/db/schema/geocode-cache.ts — FOUND, commit 8573a78
- [x] api/src/db/schema/index.ts — FOUND (modified), commit 8573a78
- [x] api/drizzle/postgis-driver-positions.sql — FOUND, commit 8573a78
- [x] tsc exit 0 — VERIFIED
- [x] SQL Point+GIST shape — VERIFIED via grep

## Self-Check: PASSED
