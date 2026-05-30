---
phase: 09-ranking-escrita-auditoria-write-flows
plan: "01"
subsystem: ranking-data-layer
tags: [ranking, writes, audit, cache, supabase, redis]
dependency_graph:
  requires: []
  provides:
    - ranking.writes.ts (upsertEvaluation, insertDriverBlock, unblockDriverBlocks, createRouteScore, updateRouteScore, deleteRouteScore)
    - ranking.audit.ts (createEvaluationLog)
    - ranking.cache.ts (bustRankingCache)
  affects:
    - api/src/modules/ranking/* (consumed by 09-03/04 endpoints)
tech_stack:
  added: []
  patterns:
    - lazy-redis-import (deferred dynamic import inside async fn — mirrors ranking.sheets.ts)
    - rankSupabase proxy (lazy Supabase client — mirrors ranking.reads.ts)
    - upsert-by-trip_id (select maybeSingle → update/insert pattern from ride-rank)
key_files:
  created:
    - api/src/modules/ranking/ranking.audit.ts
    - api/src/modules/ranking/ranking.cache.ts
    - api/src/modules/ranking/ranking.writes.ts
  modified: []
decisions:
  - "createRouteScore and updateRouteScore return the saved row (vs void in ride-rank) — needed by 09-03 for audit dados_depois and 201 response body"
  - "upsertEvaluation returns {record, existed, before} (extends ride-rank) — endpoint needs existed for CRIAÇÃO/EDIÇÃO acao choice and before for dados_antes"
metrics:
  duration: "~12 min"
  completed: "2026-05-30"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 0
---

# Phase 09 Plan 01: Ranking Write Data Layer Summary

**One-liner:** Supabase mutation functions (6 writes), single audit helper, and lazy-redis cache-bust — all ported 1:1 from ride-rank; pure data layer ready for 09-03/04 endpoint wiring.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ranking.audit.ts + ranking.cache.ts | 4954bdf | api/src/modules/ranking/ranking.audit.ts, api/src/modules/ranking/ranking.cache.ts |
| 2 | ranking.writes.ts — all Supabase mutation functions | e610e0d | api/src/modules/ranking/ranking.writes.ts |

## What Was Built

**ranking.audit.ts** — single audit helper `createEvaluationLog(log)`. Inserts one row into `evaluation_logs` (operador, acao, dados_antes, dados_depois jsonb). Throws Supabase error on failure — endpoint decides fatal vs best-effort. Mirrors `supabaseService.ts:161-164` exactly. Uses `rankSupabase` proxy (side-effect-free import).

**ranking.cache.ts** — `bustRankingCache()`. Deletes `SHEET_TRIPS_CACHE_KEY` from Redis. Uses the same lazy `getRedis()` deferred-import pattern as `ranking.sheets.ts` — top-level module load never touches Redis (keeps pure ranking tests unaffected). Errors propagate to caller.

**ranking.writes.ts** — 6 write functions:
- `upsertEvaluation`: select-maybeSingle by trip_id → update-if-found / insert-if-not. Returns `{ record, existed, before }` — endpoint uses `existed` for CRIAÇÃO/EDIÇÃO log choice and `before` for `dados_antes`.
- `insertDriverBlock`: plain insert. Used for NO_SHOW auto-block (D-09-02) and manual block.
- `unblockDriverBlocks`: sets ativo=false, manual_override=true, data_fim=now on all active blocks for driverId (D-09-07).
- `createRouteScore`: insert + select().single() — returns saved row.
- `updateRouteScore`: update + select().maybeSingle() — returns saved row or null.
- `deleteRouteScore`: delete by id.

## Verification Results

- `bun --bun tsc --noEmit` (api/): **exit 0**
- `bun test src/modules/ranking/` (dummy envs): **25 pass, 0 fail**
- 3 new files created; 0 existing files modified

## Deviations from Plan

**1. [Style] createRouteScore / updateRouteScore return row instead of void**
- **Reason:** ride-rank routeScoreService.ts returns void, but the plan spec explicitly extends this to return the saved row for audit dados_depois and endpoint 201 response — applied per plan task 2 action text.
- This is not a deviation from the plan, it is the plan's explicit extension.

**2. [Style] rankSupabase.from() calls use multiline chaining**
- Plan's acceptance grep `grep -cE "rankSupabase\.from\('(evaluations|driver_blocks|route_scores)'\)"` returned 2 (not >=6) because multiline chaining puts `rankSupabase` on a different line than `.from('table')`.
- Actual call count: 8 distinct `.from()` calls covering all required tables and operations. Functionally correct — matches ranking.reads.ts house style (same multiline pattern).

None — plan executed as written. Both style notes are non-functional.

## Threat Surface Scan

No new network endpoints introduced (this is a pure data layer). No auth paths, file access patterns, or schema changes. No threat flags.

## Known Stubs

None.

## Self-Check

- [x] api/src/modules/ranking/ranking.audit.ts exists
- [x] api/src/modules/ranking/ranking.cache.ts exists
- [x] api/src/modules/ranking/ranking.writes.ts exists
- [x] Commit 4954bdf exists (Task 1)
- [x] Commit e610e0d exists (Task 2)
- [x] tsc exit 0
- [x] 25 tests pass

## Self-Check: PASSED

Commit method: native `git commit` (no sandbox block). Commits: 4954bdf, e610e0d.
