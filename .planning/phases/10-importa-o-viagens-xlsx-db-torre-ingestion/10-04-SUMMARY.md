---
phase: 10-importa-o-viagens-xlsx-db-torre-ingestion
plan: "04"
subsystem: api
tags: [elysia, drizzle, postgis, nominatim, xlsx, multipart, upload, geocoding, positions]

requires:
  - phase: 10-01
    provides: driver_positions schema (Drizzle) + UNIQUE(motorista_norm, data_posicao) + postgis-driver-positions.sql
  - phase: 10-02
    provides: parseViagensXlsx + ParsedPosition (viagens.parser.ts)
  - phase: 10-03
    provides: geocodeText + GeocodeResult (geocoder.ts, Nominatim cache-first)
provides:
  - "POST /api/positions/import endpoint (admin-only, multipart .xlsx upload)"
  - "Orchestration: parse → geocode (sequential) → upsert ON CONFLICT DO NOTHING + ST_MakePoint geom"
  - "Response contract: { inserted, skipped, failed, total, sample[] }"
affects: [10-05, phase-11-map, positions-consumers]

tech-stack:
  added: [jose (transitive dep of @elysiajs/jwt — used directly for inline JWT verify)]
  patterns:
    - "Inline route post-wsPlugin for multipart: avoids Elysia 1.4.28 body/multipart plugin-composition bug"
    - "Inline admin gate via jose.jwtVerify + redis blacklist — mirrors authGuard+requireRole without plugin wrapping"
    - "ST_MakePoint(lng, lat) via sql template binds (X=lng, Y=lat) — never string concat (T4)"
    - "Sequential geocode loop (not Promise.all) — respects Nominatim 1 req/s ToS (T3)"

key-files:
  created: []
  modified:
    - api/src/index.ts

key-decisions:
  - "Used jose.jwtVerify directly (inline) instead of requireRole plugin — Elysia 1.4.28 multipart bug prevents plugin composition on body-consuming routes"
  - "ST_MakePoint order: (lng, lat) = (X, Y) as per PostGIS convention — matches geofences pattern"
  - "onConflictDoNothing target: [motoristaNorm, dataPosicao] — enforces idempotência D-10-04 at DB level"
  - "Best-effort per row: failed++ on exception, never aborts entire import (D-10-01)"

patterns-established:
  - "Inline multipart upload gate: read cookie → jose.jwtVerify → redis blacklist → role check → 401/403 before any file processing"

requirements-completed: [D-10-01, D-10-03, D-10-04, D-10-07]

duration: 15min
completed: 2026-06-01
---

# Phase 10 Plan 04: Import Endpoint Summary

**Inline `POST /api/positions/import` (admin) wiring parse→geocode→upsert+ST_MakePoint with jose-based gate and ON CONFLICT DO NOTHING idempotência**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-01T00:00:00Z
- **Completed:** 2026-06-01T00:15:00Z
- **Tasks:** 1 of 2 complete (Task 2 = checkpoint:human-verify, pending live import)
- **Files modified:** 1

## Accomplishments

- `POST /api/positions/import` added inline to `index.ts` — outside all plugins (Elysia 1.4.28 multipart workaround)
- Admin gate mirrors `authGuard` + `requireRole('admin')`: cookie check → `jose.jwtVerify` → redis blacklist → role assertion (401/403)
- Full pipeline per row: `parseViagensXlsx` → `geocodeText` (sequential) → `db.insert(driverPositions).onConflictDoNothing` → `ST_SetSRID(ST_MakePoint(lng,lat),4326)` on geocoded rows
- `tsc --noEmit` exit 0; Eden Treaty `App` type preserved

## Task Commits

1. **Task 1: Rota inline POST /api/positions/import** - `6bb6fd6` (feat)

## Files Created/Modified

- `api/src/index.ts` — added `POST /api/positions/import` inline route + imports (jose, driverPositions, parseViagensXlsx, geocodeText)

## Decisions Made

- `jose.jwtVerify` used directly (not via `jwtPlugin`) because the plugin cannot compose with multipart body parsing in Elysia 1.4.28; `jose` is available as a transitive dep of `@elysiajs/jwt`.
- Route positioned after `delete('/api/geofences/:id')` and before `.listen()` — same zone as telemetry/geofences inline routes, consistent with Phase 6 pattern.
- `onConflictDoNothing({ target: [driverPositions.motoristaNorm, driverPositions.dataPosicao] })` — explicit target matches the UNIQUE constraint name from Plan 01.

## Deviations from Plan

None — plan executed exactly as written. The jose direct import was the expected inline-gate implementation path (documented in PLAN.md interfaces section).

## Issues Encountered

None — tsc clean on first attempt.

## User Setup Required

None for Task 1 (code only). Task 2 (checkpoint:human-verify) requires:
- Apply `api/drizzle/postgis-driver-positions.sql` to DB Torre if not yet applied
- Start api backend
- Upload `Viagens.xlsx` via curl

## Next Phase Readiness

Task 2 (live import verification) is the pending checkpoint. Required before Phase 10 is complete:
1. Confirm `\d driver_positions` shows `geom geometry(Point,4326)` + GIST index
2. First import: `curl -b cookies.txt -F "file=@Viagens.xlsx" http://localhost:3000/api/positions/import` → `inserted ≈ 125`
3. Re-upload: `inserted: 0, skipped ≈ 125` (idempotência)
4. Second import confirms no new Nominatim calls (geocode_cache hit)
5. RBAC: no-cookie → 401, non-admin → 403

---
*Phase: 10-importa-o-viagens-xlsx-db-torre-ingestion*
*Completed: 2026-06-01 (Task 1 only; Task 2 = checkpoint pending)*
