---
phase: 09-ranking-escrita-auditoria-write-flows
plan: "07"
subsystem: ranking-ui
tags: [ranking, crud, audit, role-gate, write-flows]
dependency_graph:
  requires: [09-05]
  provides: [D-09-10-complete, LogsTab-live, RotasTab-crud]
  affects: [ranking-page, route-scores, audit-log]
tech_stack:
  added: []
  patterns: [mutation-hooks, role-gate-ux, synthetic-id-guard, controlled-dialog-form]
key_files:
  modified:
    - torre-de-controle/src/app/pages/ranking/components/LogsTab.tsx
    - torre-de-controle/src/app/pages/ranking/components/RotasTab.tsx
decisions:
  - "Import EvaluationLogRecord from @/hooks/useRanking re-export instead of deep relative path (09-05 already re-exports it)"
  - "hasRealId() compares row.id to the deterministic fallback string — edit/delete disabled for synthetic ids (T-09-28)"
  - "toolbar=null for analyst|viewer (not disabled button) — cleaner UX per D-09-10"
  - "mutationError surfaces first non-null error from create/update/delete (inline, no toast lib needed)"
metrics:
  duration: "~20 min"
  completed: "2026-05-30"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 09 Plan 07: RotasTab CRUD + LogsTab live feed — Summary

**One-liner:** Route-score CRUD (create/edit/delete) via useCreateRouteScore/useUpdateRouteScore/useDeleteRouteScore, role-gated (admin|supervisor), with a hasRealId synthetic-id guard; LogsTab wired to useRankingLogs replacing the Phase 8 const logs = [] shell.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | LogsTab — consume useRankingLogs | 2327b6b | LogsTab.tsx |
| 2 | RotasTab — CRUD + role gate | f1e367b | RotasTab.tsx |

## What Was Built

### Task 1: LogsTab (2327b6b)

- Replaced `const logs: EvaluationLogRecord[] = []` with `const { data: logs, isLoading, isError } = useRankingLogs()`
- Updated import: `EvaluationLogRecord` + `useRankingLogs` from `@/hooks/useRanking` (09-05 re-export; drops deep relative path)
- Added isLoading/isError-aware `subtitle` and `emptyMessage`
- Removed all Phase 8 placeholder copy ("habilitada na Phase 9", "Auditoria será habilitada na Phase 9")
- `renderDiff`, `ActionBadge`, `formatLogDate`, columns — untouched

### Task 2: RotasTab (f1e367b)

- Added `useCreateRouteScore`, `useUpdateRouteScore`, `useDeleteRouteScore`, `useCanWriteRanking` from `@/hooks/useRanking`
- `canWrite` (admin|supervisor) gates:
  - toolbar: renders `<Button onClick={openCreate}>Nova Pontuação</Button>` when true; `null` when false
  - columns: "Ações" column with Editar/Remover added only when `canWrite` (D-09-10)
- Route-score Dialog (create + edit modes): mirrored EvaluationFormDialog pattern; fields: origin_code, destination_code, pontuacao (number), data_inicio (date), data_fim (optional date), observacao (optional text)
- `hasRealId(row)`: compares `row.id` to the `origin_code-destination_code-data_inicio` fallback — disables edit/delete for rows without a real backend uuid (T-09-28)
- Mutation errors surfaced inline (`mutationError` = first non-null from create/update/delete)
- Removed disabled "Disponível na Phase 9" toolbar placeholder

## Verification

- `npx tsc --noEmit` (torre-de-controle): exit 0 (clean)
- `npx vite build` (torre-de-controle): exit 0 (3160 modules, RankingPage-eALrd17U.js 49.61 kB)
- LogsTab grep checks: `useRankingLogs` present, `const logs.*= \[\]` count = 0, "habilitada na Phase 9" count = 0, `renderDiff`/`ActionBadge` preserved
- RotasTab grep checks: 8 lines match mutation hooks (3 hooks ×2+ each), `.mutate` count = 3, `useCanWriteRanking` gating toolbar + actions, "Disponível na Phase 9" count = 0, `hasRealId` guard present

## Deviations from Plan

None — plan executed exactly as written. The pre-existing `ranking.scoring.ts` TS6133 error (unused `getVinculo`, in `../api/`) is out-of-scope; `npx tsc --noEmit` inside `torre-de-controle/` is clean.

## Known Stubs

None. Both components consume real data hooks (useRankingLogs, useRankingRouteScores + mutation hooks). The live data depends on the backend endpoint being deployed (09-02, 09-03, 09-04) and the `RANK_SUPABASE_SERVICE_KEY` env var being set (09-03 Task 3 checkpoint) — these are runtime prerequisites, not UI stubs.

## Threat Flags

None — no new network endpoints or auth paths introduced. Role gate is UX-only per T-09-26; real authorization is requireRole server-side.

## Self-Check: PASSED

- LogsTab.tsx: exists, useRankingLogs wired, no placeholder copy
- RotasTab.tsx: exists, 3 mutation hooks, hasRealId guard, canWrite gate
- Commits 2327b6b and f1e367b: present in git log
