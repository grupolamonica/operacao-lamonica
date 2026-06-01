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
  duration: "~25 min"
  completed: "2026-06-01"
  tasks_completed: 3
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

## Task 3 — CHECKPOINT (VERIFICADO)

**Type:** `checkpoint:human-verify` (gate: blocking)
**Status:** VERIFICADO live pelo usuário (getFleetPositions contra Supabase Torre + ranking proxy com RANK_*)

Resultado da verificação live:
- **69 posições** retornadas, **sem duplicatas** por motorista, lat/lng numéricos ✓
- **401 sem cookie** (authGuard estrutural) ✓
- **21/69 posições enriquecidas** (ranked:true) após o fix do ID-suffix no join
- **ADAUTO SANTOS COSTA:** `ranked=true`, `status=ATIVO`, `rank=1`, `pontuacao=93.2` ✓
- Posições sem match no ranking → `ranked:false`, `status:null` (marcador neutro) ✓

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

**2. [Rule 1 - Bug] ID-suffix no nome do ranking quebrava o join (0 matches)**
- **Found during:** Task 3 (verificação live do join, pelo usuário)
- **Issue:** o `nome` do ranking traz o ID do motorista no fim — `"ADAUTO SANTOS COSTA (2729070)"` — enquanto `driver_positions.motorista_norm` (da planilha) NÃO tem o ID. `normalizeMotorista()` direto nunca batia → 0/69 enriquecidas.
- **Fix:** strip do sufixo ` (\d+)` via `d.nome.replace(/\s*\(\d+\)\s*$/, '')` ANTES de `normalizeMotorista` na montagem do `byName` Map.
- **Files modified:** `api/src/modules/positions/positions.service.ts` (linha ~91)
- **Commit:** corrigido e commitado pelo usuário fora desta task; re-verificado live → 21/69 enriquecidas, ADAUTO ranked=true rank=1 pts=93.2.

## Known Stubs

None — getFleetPositions() implementado com query real (geom IS NOT NULL), join real (getRankingDrivers), projeção completa. Join live VERIFICADO (Task 3): 69 posições, 21 enriquecidas, ADAUTO rank=1.

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
