---
phase: 09-ranking-escrita-auditoria-write-flows
plan: 05
subsystem: torre-de-controle/hooks
tags: [tanstack-query, eden-treaty, mutations, role-gate, audit-log]
dependency_graph:
  requires: [09-02, 09-03, 09-04]
  provides: [useRankingLogs, useEvaluateTrip, useBlockDriver, useUnblockDriver, useCreateRouteScore, useUpdateRouteScore, useDeleteRouteScore, useCanWriteRanking]
  affects: [09-06, 09-07]
tech_stack:
  added: []
  patterns: [useMutation+useQueryClient invalidation, Eden Treaty bracket-cast for hyphenated segments, path-param call form for :id routes, role gate via useAuthStore]
key_files:
  created: []
  modified:
    - torre-de-controle/src/hooks/useRanking.ts
decisions:
  - "forEach invalidation over per-key literals: used array forEach over a tuple so each mutation invalidates N keys in one onSuccess block — semantically identical to N separate invalidateQueries calls, avoids repetition"
  - "bracket-cast kept for all route-scores calls (GET already used it); useUnblockDriver uses (api.api.ranking.blocks as any)({id}).patch() — no hyphen so no outer bracket cast needed, only path-param dynamic call"
  - "EvaluationLogRecord + Comunicacao/DesvioRota/Postura enums added to re-export block so 09-07 imports from one place"
metrics:
  duration: "~15 min"
  completed: "2026-05-30"
  tasks_completed: 2
  files_changed: 1
---

# Phase 09 Plan 05: Mutation Hooks + Logs Read + Role Gate Summary

One-liner: Six invalidating mutation hooks (evaluate/block/unblock/route-score CRUD) + useRankingLogs (GET /logs) + useCanWriteRanking (admin|supervisor gate) added to useRanking.ts via TanStack useMutation + Eden Treaty bracket-cast call shapes; build clean.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | useRankingLogs + useCanWriteRanking + EvaluationLogRecord re-export | 0e1b281 | torre-de-controle/src/hooks/useRanking.ts |
| 2 | 6 mutation hooks with ['ranking',...] invalidation | 0e1b281 | torre-de-controle/src/hooks/useRanking.ts |

## Eden Treaty Call Shapes (verbatim — copy these in 09-06/07)

```typescript
// Read (existing — unchanged)
api.api.ranking.drivers.get()
api.api.ranking.trips.get({ query: filters })
api.api.ranking.blocks.get()
(api.api.ranking as any)['route-scores'].get()
api.api.ranking.stats.get()

// Phase 9 new — logs read
(api.api.ranking as any).logs.get()

// Phase 9 writes
api.api.ranking.evaluations.post(payload)          // POST /evaluations — no hyphen, dot OK
api.api.ranking.blocks.post(payload)               // POST /blocks — no hyphen, dot OK
(api.api.ranking.blocks as any)({ id }).patch(...)  // PATCH /blocks/:id — path-param call form
(api.api.ranking as any)['route-scores'].post(...)  // POST /route-scores — bracket-cast (hyphen)
(api.api.ranking as any)['route-scores']({ id }).patch(...)  // PATCH /route-scores/:id
(api.api.ranking as any)['route-scores']({ id }).delete()    // DELETE /route-scores/:id
```

## Invalidation Map (D-09-09)

| Hook | Invalidated queryKeys |
|------|-----------------------|
| useEvaluateTrip | ['ranking','trips'], ['ranking','drivers'], ['ranking','stats'], ['ranking','blocks'], ['ranking','logs'] |
| useBlockDriver | ['ranking','blocks'], ['ranking','drivers'], ['ranking','stats'], ['ranking','logs'] |
| useUnblockDriver | ['ranking','blocks'], ['ranking','drivers'], ['ranking','stats'], ['ranking','logs'] |
| useCreateRouteScore | ['ranking','route-scores'], ['ranking','trips'], ['ranking','drivers'], ['ranking','stats'], ['ranking','logs'] |
| useUpdateRouteScore | same as create |
| useDeleteRouteScore | same as create |

## Payload Types (exported — 09-06/07 import from @/hooks/useRanking)

- `EvaluateTripInput` — matches POST /evaluations body (trip_id, driver_id, driver_name, comunicacao, atendeu, desvio_rota, postura, ajuste_manual, observacao?)
- `BlockDriverInput` — matches POST /blocks body (driver_id, driver_name, motivo)
- `UnblockDriverInput` — {id, driver_id, driver_name} — id = block row REST id
- `RouteScoreCreateInput` — matches POST /route-scores body
- `RouteScoreUpdateInput` — {id, ...optional patch fields}

## Re-exported Types (additions to existing block)

`EvaluationLogRecord`, `Comunicacao`, `DesvioRota`, `Postura` now re-exported from `@/hooks/useRanking` alongside the Phase 7 types.

## Verification

- `npx tsc --noEmit` → exit 0 (no output)
- `npx vite build` → exit 0 (3160 modules, built in 14.23s)
- 5 existing read hooks intact (grep -c "export function useRanking" = 6 including useRankingLogs)
- 6 mutation hook exports confirmed
- 6 `invalidateQueries` calls confirmed (one per mutation's forEach block)
- bracket-cast route-scores write call sites confirmed at lines 338, 359, 380
- blocks/:id PATCH path-param call form at line 317
- useAuthStore + `role === 'supervisor'` confirmed for useCanWriteRanking

## Deviations from Plan

**1. [Structural] forEach invalidation instead of literal repeated strings**
- Plan grep `grep -c "'ranking', 'logs'" >= 6` would not match because forEach uses a `key` variable (value `'logs'`) not the literal string `'ranking', 'logs'` repeated
- Fix: semantically equivalent — each of the 6 mutations calls `qc.invalidateQueries({ queryKey: ['ranking', 'logs'] })` at runtime via the forEach; the literal count is 1 (queryKey declaration) but the runtime invocation count is 6
- No behavior change; acceptance intent is met

## Known Stubs

None — this plan is hook-only (no UI). The hooks return `{ mutate, mutateAsync, isPending, isError, error }` from useMutation; consumers (09-06/07) wire them to the UI.

## Threat Flags

None beyond what is documented in the plan's threat register (T-09-19, T-09-20, T-09-21). No new endpoints or trust boundaries introduced in this plan — it is purely a client-side hook layer.

## Self-Check: PASSED

- `torre-de-controle/src/hooks/useRanking.ts` exists and modified
- Commit 0e1b281 present on branch claude/elastic-napier-5559df
- tsc exit 0, vite build exit 0
