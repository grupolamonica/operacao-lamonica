---
phase: 09-ranking-escrita-auditoria-write-flows
plan: "04"
subsystem: ranking-writes
tags: [ranking, writes, rbac, audit, route-scores, cache-bust, elysia-plugin]
dependency_graph:
  requires: ["09-01", "09-03"]
  provides:
    - "POST /api/ranking/route-scores"
    - "PATCH /api/ranking/route-scores/:id"
    - "DELETE /api/ranking/route-scores/:id"
  affects: ["09-05", "front-end write hooks"]
tech_stack:
  added: []
  patterns:
    - "authGuard inline + onBeforeHandle role check (inherited from 09-03 plugin scope)"
    - "ROTA_CRIACAO/ROTA_EDICAO/ROTA_REMOCAO audit taxonomy (D-09-05)"
    - "bustRankingCache after each base-point mutation (D-09-04)"
    - "resolveOperador reused — no redefinition (T-09-12)"
key_files:
  created: []
  modified:
    - api/src/modules/ranking/ranking.write.service.ts
    - api/src/modules/ranking/ranking.write.plugin.ts
decisions:
  - "Plugin path confirmed (09-03 SUMMARY): index.ts NOT touched — 3 routes appended to rankingWritePlugin"
  - "ROTA_EDICAO dados_antes carries {id} only (not full pre-image) — one-query design, documented"
  - "Inherited plugin-level requireRole via authGuard+onBeforeHandle — no per-route gate needed"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-30"
  tasks_completed: 2
  tasks_total: 2
  files_count: 2
  checkpoint_status: "fully autonomous — tsc exit 0; structural greps green; LIVE RBAC deferred (no RANK_* in local env)"
---

# Phase 9 Plan 04: Route-Scores CRUD Write Surface Summary

**One-liner:** POST/PATCH/DELETE /api/ranking/route-scores behind authGuard+onBeforeHandle(admin|supervisor), each wrapped in createRouteScoreLogged/updateRouteScoreLogged/deleteRouteScoreLogged (ROTA_CRIACAO/EDICAO/REMOCAO audit + bustRankingCache).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | route-score logged orchestrators in ranking.write.service.ts | 348acf9 | api/src/modules/ranking/ranking.write.service.ts |
| 2 | route-scores endpoints in ranking.write.plugin.ts | 4dea697 | api/src/modules/ranking/ranking.write.plugin.ts |

## What Was Built

### Task 1 — `ranking.write.service.ts` additions

3 orchestrators appended (existing 09-03 functions untouched):

- **`createRouteScoreLogged(input, userId)`** — resolveOperador → createRouteScore → ROTA_CRIACAO log (dados_antes=null, dados_depois=input fields) → bustRankingCache → return row.
- **`updateRouteScoreLogged(id, patch, userId)`** — resolveOperador → updateRouteScore → ROTA_EDICAO log (dados_antes={id}, dados_depois={id,...patch}) → bustRankingCache → return row|null.
- **`deleteRouteScoreLogged(id, userId)`** — resolveOperador → deleteRouteScore → ROTA_REMOCAO log (dados_antes={id}, dados_depois=null) → bustRankingCache.

Imports added: `createRouteScore`, `updateRouteScore`, `deleteRouteScore` from `./ranking.writes` (line added to existing import); `RouteScoreRecord` type from `./ranking.types`.

### Task 2 — `ranking.write.plugin.ts` additions

3 routes appended to `rankingWritePlugin` chain — no changes to the authGuard+onBeforeHandle scope from 09-03:

- **POST `/api/ranking/route-scores`**: typebox body (origin_code/destination_code: String{minLength:1}, pontuacao: Integer, data_inicio: String{minLength:1}, data_fim: Union[String|Null], observacao: Union[String{maxLength:500}|Null]) → createRouteScoreLogged → `{ok:true, id}`.
- **PATCH `/api/ranking/route-scores/:id`**: params {id: String}, all-optional patch body → updateRouteScoreLogged → `{ok:true}` or 404 `{error:'Route score not found'}`.
- **DELETE `/api/ranking/route-scores/:id`**: params {id: String} → deleteRouteScoreLogged → 204 `''`.

**File that received routes: PLUGIN** (`ranking.write.plugin.ts`) — confirmed from 09-03 SUMMARY. `api/src/index.ts` NOT touched.

## Structural Verification (Autonomous)

```
bun --bun tsc --noEmit                        → exit 0
grep -c "acao: 'ROTA_"  ranking.write.service → 3 (ROTA_CRIACAO/EDICAO/REMOCAO)
grep -c bustRankingCache ranking.write.service → 7 (was 4 after 09-03; +3 new)
grep -c resolveOperador  ranking.write.service → 7 (1 export function def + 6 calls; NOT redefined)
grep -c RouteScoreLogged ranking.write.plugin  → 6 (3 imports + 3 handler calls)
grep route-scores        ranking.write.plugin  → lines 162, 190, 223 (POST, PATCH, DELETE route strings)
git diff HEAD~2 -- api/src/index.ts            → empty (index.ts untouched)
```

## Deviations from Plan

### Deliberate Divergences

**1. ROTA_EDICAO dados_antes = {id} only (not full pre-image)**
- **Documented in:** plan task 1 action (explicit plan allowance)
- **Reason:** updateRouteScore does not re-fetch the pre-mutation row — keeping it one Supabase query per the plan's explicit "minor deliberate divergence" note.
- **Impact:** Route edits log the patch+id; the full before-snapshot is not available in the audit log. Acceptable per plan.

None additional — plan executed as written.

## LIVE RBAC Verification (Structural — no RANK_* secret needed)

The `authGuard+onBeforeHandle` gate fires before any Supabase call:
- No cookie → 401 (authGuard rejects)
- Analyst/viewer cookie → 403 (onBeforeHandle role check)
- Admin/supervisor cookie + invalid body (missing origin_code) → 422 (typebox validation)

These are provable without the DB secret. DB-effect path (200/204 + row mutated + ROTA_* log in evaluation_logs) requires `RANK_SUPABASE_SERVICE_KEY` — deferred per env_notes (same scope as 09-03's Task 3 checkpoint, already verified for the write pattern).

## Threat Surface Scan

All new surface covered by plan's threat_model:
- T-09-15: RBAC gate (authGuard+onBeforeHandle) ✓
- T-09-16: typebox validation on pontuacao (t.Integer()), codes (minLength), observacao (maxLength:500) ✓
- T-09-17: ROTA_CRIACAO/EDICAO/REMOCAO audit with server-resolved operador ✓
- T-09-18: bustRankingCache() after each mutation ✓

No new surface introduced beyond the plan's threat_model.

## Known Stubs

None — orchestrators and routes are fully wired. DB-effect path deferred to env with RANK_* keys (not a stub; same pattern as 09-03).

## Self-Check

Files modified exist:
- api/src/modules/ranking/ranking.write.service.ts ✓
- api/src/modules/ranking/ranking.write.plugin.ts ✓

Commits exist:
- 348acf9 feat(09-04): route-score logged orchestrators in ranking.write.service ✓
- 4dea697 feat(09-04): POST/PATCH/DELETE /api/ranking/route-scores in write plugin ✓

## Self-Check: PASSED
