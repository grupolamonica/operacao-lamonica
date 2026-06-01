---
phase: 10-importa-o-viagens-xlsx-db-torre-ingestion
plan: "03"
subsystem: api/positions/geocoder
tags: [geocoding, nominatim, cache, rate-limit, best-effort, tdd]
dependency_graph:
  requires: [10-01]
  provides: [geocodeText, GeocodeResult]
  affects: [10-04]
tech_stack:
  added: []
  patterns:
    - cache-first (SELECT geocode_cache before any HTTP)
    - rate-limiter singleton (promise-chaining, >=1000ms gap)
    - lazy dynamic import (defer DB module-eval until call-time)
    - best-effort (all errors caught, no propagation)
    - range validation (lat[-90,90], lng[-180,180])
key_files:
  created:
    - api/src/modules/positions/geocoder.ts
    - api/src/modules/positions/geocoder.test.ts
  modified: []
decisions:
  - key: lazy-db-import
    choice: Dynamic import inside getDb() helper
    reason: >
      api/src/db/client.ts throws at module-eval if DATABASE_URL is absent.
      Top-level import would crash test process (no DB in test env).
      Replicates the pattern from ranking.sheets.ts (lazy redis import).
  - key: rate-limiter-design
    choice: Promise-chaining singleton (_lastCallPromise)
    reason: >
      Simple, zero-dependency sequential gate. Enchaing ensures each HTTP call
      waits for the previous slot (including the >=1000ms sleep). Cache-hits
      skip the chain entirely.
  - key: uf-resolution-priority
    choice: ISO3166-2-lvl4 first, then address.state name map
    reason: >
      ISO suffix (BR-BA -> BA) is more reliable than name string matching
      across Nominatim language variants. Fallback covers cases where the
      ISO field is absent.
metrics:
  duration: 20m
  completed: "2026-06-01T11:52:00Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 10 Plan 03: Geocoder cache-first + Nominatim rate-limit + best-effort Summary

**One-liner:** Geocoder Nominatim cache-first com rate-limit sequencial 1/s, User-Agent ToS, validação lat/lng faixa, best-effort — lazy DB import para isolamento de testes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | geocoder.ts implementation | `1bb70ae` | api/src/modules/positions/geocoder.ts |
| 2 | geocoder.test.ts (5 cases) | `d67f7bf` | api/src/modules/positions/geocoder.test.ts |

## Verification Results

- `bunx tsc --noEmit`: exit 0 (no errors)
- `bun test src/modules/positions/geocoder.test.ts`: 5 pass, 0 fail
- `grep "User-Agent" geocoder.ts`: found at line 130 (header in rateLimitedFetch)
- `grep "countrycodes=br&limit=1&addressdetails=1" geocoder.ts`: present in URL construction

## Implementation Details

**geocodeText(query: string): Promise<GeocodeResult>**

1. Trim query; empty string → immediate EMPTY_MISS (no DB/fetch access).
2. Cache-first: `db.select().from(geocodeCache).where(eq(geocodeCache.query, q))`. Hit → return immediately (no rate-limit slot consumed).
3. Miss: `rateLimitedFetch(url)` — singleton promise-chain ensures >=1000ms between HTTP calls. Header: `User-Agent: TorreDeControle/1.0 (contato interno Lamonica)`.
4. Parse Nominatim item: `parseFloat(item.lat/lon)`, `resolveCidade` (city??town??village??municipality), `resolveUf` (ISO3166-2-lvl4 suffix, then state name map).
5. Range validation (T4): lat ∉ [-90,90] or lng ∉ [-180,180] or NaN → degrade to miss.
6. Cache write (miss or hit): `db.insert(geocodeCache).values({...}).onConflictDoNothing()`. Miss written with null lat/lng to prevent re-fetch.
7. All DB + fetch errors caught; best-effort returns `{ geocoded: false }`.

## Test Coverage

| Case | What is proven |
|------|----------------|
| cache-hit | `spyOn(globalThis.fetch)` → 0 calls; result from cached row |
| cache-miss + Nominatim | fetch called once; uf=BA; db.insert called (cache write) |
| lat=999 (out of range) | geocoded:false, lat:null (T4 validation) |
| fetch throws | geocoded:false, no exception propagated (best-effort) |
| empty query | no DB/fetch access; immediate EMPTY_MISS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript cast for globalThis.fetch mock**
- **Found during:** Task 2 (tsc check)
- **Issue:** `mock(...)` does not fully overlap with `typeof fetch` (missing `preconnect` property); cast `as typeof globalThis.fetch` rejected by TS.
- **Fix:** Added double cast `as unknown as typeof globalThis.fetch` — standard pattern for mocking built-in globals.
- **Files modified:** api/src/modules/positions/geocoder.test.ts
- **Commit:** `d67f7bf` (same task commit, fix applied inline before commit)

## Known Stubs

None — geocoder.ts is complete and directly usable by Plan 04 (endpoint).

## Threat Surface Scan

No new network endpoints introduced. `geocoder.ts` is an internal module (called by Plan 04 endpoint). Threat mitigations from plan applied:
- T-10-03: rate-limit + User-Agent + cache-first + best-effort (no retry loop)
- T-10-04b: lat/lng range validation before accepting result
- T-10-05: no logging of query content or coordinates

## Self-Check

- [x] `api/src/modules/positions/geocoder.ts` exists
- [x] `api/src/modules/positions/geocoder.test.ts` exists
- [x] commit `1bb70ae` present (feat geocoder.ts)
- [x] commit `d67f7bf` present (test geocoder.test.ts)
- [x] tsc exit 0
- [x] 5/5 tests pass

## Self-Check: PASSED
