---
phase: 08-ranking-ui
plan: 01
subsystem: torre-frontend
tags: [ranking, hooks, eden-treaty, tanstack-query, read-only]
requires:
  - "Phase 7 ranking endpoints (/api/ranking/*) live + App type re-export"
provides:
  - "useRankingDrivers/Trips/Blocks/RouteScores/Stats hooks (read-only)"
  - "Re-export dos tipos do contrato Phase 7 (RankedDriver, Trip, DriverBlockRecord, RouteScoreRecord, RankingStats, Driver, StatusMetrics) para as abas"
affects:
  - "torre-de-controle/src/hooks/useRanking.ts"
tech-stack:
  added: []
  patterns:
    - "Eden Treaty + TanStack Query (padrão useInsights/useTrips), staleTime 30s"
    - "Bracket-notation `(api.api.ranking as any)['route-scores']` para segmento com hífen"
    - "Re-export de tipos do backend via path relativo `../../../api/src/...` (mesmo estilo de types/api.ts)"
key-files:
  created:
    - "torre-de-controle/src/hooks/useRanking.ts"
  modified: []
decisions:
  - "Tipos re-exportados direto do contrato Phase 7 (sem redefinição manual) — single source of truth"
  - "useRankingTrips usa cast `as any` no query (igual useTrips) por causa do schema t.Optional do backend"
  - "Nenhum hook de mutação — escrita é Phase 9 (read-only por design D-V2-03)"
metrics:
  duration: ~6min
  completed: 2026-05-30
---

# Phase 8 Plan 01: Ranking Hooks (Eden Treaty + TanStack) Summary

5 hooks read-only TanStack Query consumindo `/api/ranking/*` via Eden Treaty, tipados pelo contrato fixo do Phase 7 e com os tipos re-exportados para as abas das waves seguintes.

## What Was Built

`torre-de-controle/src/hooks/useRanking.ts` — fundamento de dados das 6 abas do Phase 8:

| Hook | Endpoint | Retorno | queryKey |
|------|----------|---------|----------|
| `useRankingDrivers()` | `api.api.ranking.drivers.get()` | `RankedDriver[]` | `['ranking','drivers']` |
| `useRankingTrips(filters?)` | `api.api.ranking.trips.get({ query })` | `Trip[]` | `['ranking','trips', filters]` |
| `useRankingBlocks()` | `api.api.ranking.blocks.get()` | `DriverBlockRecord[]` | `['ranking','blocks']` |
| `useRankingRouteScores()` | `(api.api.ranking as any)['route-scores'].get()` | `RouteScoreRecord[]` | `['ranking','route-scores']` |
| `useRankingStats()` | `api.api.ranking.stats.get()` | `RankingStats` | `['ranking','stats']` |

- **Contrato de retorno** idêntico aos hooks v1 (`useTrips`/`useInsights`): `{ data, isLoading, isError, error, refetch }`.
- **staleTime 30_000** em todos (alinhado ao cache Redis curto do backend).
- **Defaults**: `[]` para listas; `{ activeDrivers:0, top3Avg:0, totalTrips:0, activeBlocks:0 }` para stats.
- **Error handling**: `throw new Error((error.value as any)?.error ?? 'Failed to fetch ranking <x>')` (padrão useTrips).
- **Tipos re-exportados** do contrato Phase 7 (path relativo, mesmo estilo de `types/api.ts`):
  - `RankedDriver`, `RankingStats` de `ranking.service`
  - `Driver`, `Trip`, `DriverBlockRecord`, `RouteScoreRecord`, `StatusMetrics` de `ranking.types`

## How It Works

O `App` type (`api/src/types/api.ts` → `typeof app`) já inclui o `rankingPlugin` montado em `index.ts` com `.group('/api/ranking', ...)`. O Eden Treaty mapeia o grupo para `api.api.ranking.{drivers,trips,blocks,stats}` (dot-notation) e `(api.api.ranking as any)['route-scores']` (bracket por causa do hífen). O cliente treaty (`@/lib/api`) já injeta `credentials:'include'`, então o cookie JWT do Torre é a credencial — sem nenhuma secret no front (T-08-01 accept, T-08-02 mitigada pelo authGuard do backend).

`useRankingTrips` segue o padrão de `useTrips`: cast `as any` no `query` porque o schema do backend é `t.Object({ from: t.Optional, to: t.Optional })` e o Eden infere os params como opcionais.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `cd torre-de-controle && npx tsc -b --noEmit` → **exit 0** (projeto inteiro compila com os novos hooks).
- Acceptance grep:
  - 5 exports `useRanking(Drivers|Trips|Blocks|RouteScores|Stats)` → **5** ✓
  - `export type` → **2** (≥2) ✓
  - `api.api.ranking` → **6** (≥5) ✓
  - `['route-scores']` → **2** (≥1) ✓
  - mutações `.(post|patch|delete)(` → **0** ✓

## Known Stubs

None — os hooks consomem dados reais de `/api/ranking/*`. As abas que renderizam estes dados são das waves seguintes (08-02+).

## Self-Check: PASSED

- FOUND: torre-de-controle/src/hooks/useRanking.ts
- FOUND: commit 83b903a (feat(08-01): ranking hooks)
