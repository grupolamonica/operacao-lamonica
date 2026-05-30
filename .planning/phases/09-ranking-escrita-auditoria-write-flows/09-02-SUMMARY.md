---
phase: 09-ranking-escrita-auditoria-write-flows
plan: "02"
subsystem: ranking-api
tags: [ranking, audit, read-endpoint, authGuard]
dependency_graph:
  requires: [09-01]
  provides: [GET /api/ranking/logs]
  affects: [LogsTab (09-07), ranking.plugin.ts, ranking.service.ts]
tech_stack:
  added: []
  patterns: [thin-orchestrator, authGuard-plugin-level]
key_files:
  modified:
    - api/src/modules/ranking/ranking.plugin.ts
    - api/src/modules/ranking/ranking.service.ts
decisions:
  - "D-09-01: GET /logs behind authGuard only — any authenticated role reads audit log; no requireRole gate"
  - "D-09-07: /logs is the 6th GET on the READ plugin, not the write plugin"
metrics:
  duration: "~5min"
  completed: "2026-05-30"
  tasks_completed: 1
  tasks_total: 1
---

# Phase 09 Plan 02: GET /api/ranking/logs — Audit Read Endpoint Summary

**One-liner:** 6th GET endpoint on ranking read plugin exposing evaluation_logs desc via getRankingLogs thin orchestrator wrapping fetchEvaluationLogs.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add GET /api/ranking/logs + getRankingLogs orchestrator | 0246a07 | ranking.plugin.ts, ranking.service.ts |

## What Was Built

- `ranking.service.ts`: added `getRankingLogs(): Promise<EvaluationLogRecord[]>` — one-liner passthrough to `fetchEvaluationLogs()` (already orders desc, limits 200). Added `fetchEvaluationLogs` to the `./ranking.reads` import and `EvaluationLogRecord` to the type import.
- `ranking.plugin.ts`: added 6th `.get('/logs', () => getRankingLogs(), { detail: { tags: ['ranking'], summary: 'Log de auditoria (evaluation_logs), ordenado desc' } })` inside the existing `.group('/api/ranking', ...)` chain, after `/stats`. Updated header doc to reflect 6 endpoints and document the Phase 9 rationale (read-only, authGuard only, no requireRole per D-09-01).

## Verification

- `bun --bun tsc --noEmit` (api/) → exit 0.
- `grep -n "'/logs'" ranking.plugin.ts` → line 74.
- `grep -n "getRankingLogs" ranking.service.ts` → line 281.
- Endpoint inherits plugin-level `authGuard` (T-09-09 mitigated): unauthenticated request returns 401.

## Deviations from Plan

None — plan executed exactly as written. `fetchEvaluationLogs` existed in ranking.reads.ts; `EvaluationLogRecord` existed in ranking.types.ts. Zero new logic required.

## Threat Flags

None. No new trust boundaries introduced. T-09-09 (unauthenticated read) mitigated by existing plugin-level authGuard inheritance. T-09-10 (PII via errors) covered by Phase 7 global onError. T-09-11 (requireRole over-gating) explicitly accepted per D-09-01.

## Self-Check: PASSED

- `api/src/modules/ranking/ranking.plugin.ts` — exists, contains `/logs`
- `api/src/modules/ranking/ranking.service.ts` — exists, contains `getRankingLogs`
- Commit 0246a07 — verified via `git rev-parse --short HEAD`
- tsc exit 0
