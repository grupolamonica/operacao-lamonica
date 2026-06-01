---
phase: 11-mapa-frota-importada-geospatial
plan: "01"
subsystem: api/positions
tags: [positions, ranking, geospatial, authGuard, DISTINCT-ON, cross-source-join]
dependency_graph:
  requires:
    - "10-driver-positions-geocoded (driver_positions table + geom)"
    - "07-ranking-proxy (getRankingDrivers, cache 60s)"
  provides:
    - "GET /api/positions (FleetPosition[], authGuard)"
    - "getFleetPositions() — última posição geocodada/motorista enriquecida"
  affects:
    - "api/src/types/api.ts (App type — Eden Treaty para Plan 02)"
tech_stack:
  added: []
  patterns:
    - "DISTINCT ON (motorista_norm) ORDER BY motorista_norm, data_posicao DESC — 1 row/motorista"
    - "Cross-source join: DB Torre × ride-rank via Map<normalizeMotorista(nome), driver>"
    - "db.execute(sql`...`) as unknown as PositionRow[] — raw SQL p/ coluna geom não no schema TS"
    - "postgres.js numeric → string → Number() coercion para lat/lng"
    - "Elysia plugin pattern: authGuard no nível do plugin (não por rota)"
key_files:
  created:
    - api/src/modules/positions/positions.service.ts
    - api/src/modules/positions/positions.plugin.ts
  modified:
    - api/src/index.ts
decisions:
  - "geom IS NOT NULL como critério canônico de geocodada (D-11-02) — coluna gerida via SQL manual fora do schema TS Drizzle; usar raw sql template"
  - "getRankingDrivers chamado 1x por request e indexado em Map<string, RankedDriver> — O(1) lookup, cache 60s herdado do service"
  - "as unknown as PositionRow[] — double-cast necessário porque db.execute retorna RowList<Record<string,unknown>[]>; não overlaps com PositionRow[] diretamente"
  - "positionsReadPlugin registrado ANTES de wsPlugin (Elysia 1.4 wsPlugin-last rule)"
metrics:
  duration: "~20 min"
  completed: "2026-06-01"
  tasks_completed: 2
  tasks_total: 3
  files_created: 2
  files_modified: 1
---

# Phase 11 Plan 01: GET /api/positions — Frota Importada + Join Ranking Summary

**One-liner:** `GET /api/positions` (authGuard) servindo última posição geocodada/motorista via DISTINCT ON, enriquecida server-side com `getRankingDrivers()` via Map indexado por `normalizeMotorista`.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | positions.service.ts — getFleetPositions | `a7121b3` | `api/src/modules/positions/positions.service.ts` (created) |
| 2 | positions.plugin.ts + wire index.ts | `3fc20e0` | `api/src/modules/positions/positions.plugin.ts` (created), `api/src/index.ts` (modified) |

## Task 3 — CHECKPOINT (pending)

**Type:** `checkpoint:human-verify` (gate: blocking)
**Status:** Awaiting `RANK_SUPABASE_SERVICE_KEY` no .env + servidor local + verificação curl

## Verification Passed (autonomous)

- `cd api && npx tsc --noEmit` — exit 0 (sem erros em positions.service.ts / positions.plugin.ts)
- `grep DISTINCT ON` — linha 69 do service (query SQL)
- `grep getRankingDrivers` — linha 15 (import) + linha 84 (chamada fora do loop)
- `grep normalizeMotorista` — linha 16 (import) + linha 88 (Map index)
- `grep "geom IS NOT NULL"` — linha 79 (WHERE clause)
- `grep ST_X` / `grep ST_Y` — ausentes (lat/lng colunas diretas)
- `grep positionsReadPlugin` em index.ts — linha 187 (antes linha 188 wsPlugin)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Double-cast para db.execute result**
- **Found during:** Task 1 (tsc check)
- **Issue:** `db.execute(sql...)` retorna `RowList<Record<string,unknown>[]>` — incompatível com cast direto para `PositionRow[]` (no index signature)
- **Fix:** `as unknown as PositionRow[]` (padrão seguro para raw SQL results no Drizzle/postgres.js)
- **Files modified:** `api/src/modules/positions/positions.service.ts`
- **Commit:** `a7121b3`

## Known Stubs

None — getFleetPositions() implementado com query real (geom IS NOT NULL), join real (getRankingDrivers), projeção completa. O join live (ranked:true/false) depende de RANK_* envs — verificação adiada para Task 3 checkpoint.

## Threat Surface Scan

Nenhuma nova superfície além do registrada no threat_model do plano:
- `GET /api/positions` → authGuard (T-11-01: mitigado)
- Join cross-source → server-side, anon key nunca sai (T-11-02: mitigado)
- PII (nomes+localização) → sem logs de valores de linha (T-11-03: mitigado)

## Self-Check

- [x] `api/src/modules/positions/positions.service.ts` — EXISTS
- [x] `api/src/modules/positions/positions.plugin.ts` — EXISTS
- [x] `api/src/index.ts` — MODIFIED (positionsReadPlugin import + .use() + swagger tag)
- [x] Commit `a7121b3` — EXISTS (git log)
- [x] Commit `3fc20e0` — EXISTS (git log)

## Self-Check: PASSED
