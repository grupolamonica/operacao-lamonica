---
phase: 09-ranking-escrita-auditoria-write-flows
plan: "06"
subsystem: ranking-write-ui
tags: [ranking, write-ui, role-gate, mutation, evaluation, blocks]
dependency_graph:
  requires: [09-05]
  provides: [wired-evaluation-form, wired-bloqueios-tab, wired-viagens-tab-trigger]
  affects: [ranking-page]
tech_stack:
  added: []
  patterns: [useMutation-invalidate, useCanWriteRanking-gate, Dialog-form]
key_files:
  created: []
  modified:
    - torre-de-controle/src/app/pages/ranking/components/EvaluationFormDialog.tsx
    - torre-de-controle/src/app/pages/ranking/components/BloqueiosTab.tsx
    - torre-de-controle/src/app/pages/ranking/components/ViagensTab.tsx
decisions:
  - "In-dialog Bloquear button REMOVED: manual block lives in BloqueiosTab toolbar only (single entry point, cleaner UX)"
  - "ViagensTab read-only path: action cell renders muted em-dash for !canWrite (hidden trigger)"
  - "Manual-block dialog: standalone ManualBlockDialog component inside BloqueiosTab.tsx; motivo maxLength=500 matching backend"
metrics:
  duration: "~20 min"
  completed: "2026-05-30"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 09 Plan 06: Wire Ranking Write UI (EvaluationFormDialog + BloqueiosTab + ViagensTab) Summary

Wired the Phase 8 read-only shells into live mutation-backed write controls, gated by `useCanWriteRanking` (admin|supervisor write; analyst|viewer read-only). All Phase 9 placeholder banners removed.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Wire EvaluationFormDialog (useEvaluateTrip) + gate ViagensTab trigger | 1b45034 | EvaluationFormDialog.tsx, ViagensTab.tsx |
| 2 | Wire BloqueiosTab (useUnblockDriver + useBlockDriver) | 1b45034 | BloqueiosTab.tsx |

## What Was Implemented

### EvaluationFormDialog.tsx
- `useEvaluateTrip()` wired; `onSave` assembles `EvaluateTripInput` and calls `evaluateTrip.mutate(payload, { onSuccess: () => onOpenChange(false) })`
- `operador` field **removed** from form and payload — server-resolved from JWT (T-09-23 / D-09-03)
- `atendeu: !noShow` — NO-SHOW checkbox triggers server-side auto-block (D-09-02)
- `Salvar` button: `disabled={!canWrite || evaluateTrip.isPending}` with "Salvando…" label while pending
- **In-dialog "Bloquear" button removed** (decision: single entry point in BloqueiosTab toolbar)
- Phase 8 `PHASE9_NOTICE` / `PHASE9_TITLE` placeholders fully removed
- Read-only notice ("Somente leitura — seu perfil não permite escrita") shown when `!canWrite`; all inputs disabled
- Inline error display via `evaluateTrip.isError` → `evaluateTrip.error?.message`

### ViagensTab.tsx
- `useCanWriteRanking` imported and called
- Action column: renders `<span>—</span>` for `!canWrite`; button only for write-eligible roles
- `canWrite` added to `useMemo` dependency array

### BloqueiosTab.tsx
- `useUnblockDriver()`, `useBlockDriver()`, `useCanWriteRanking()` added
- Row action "Desbloquear": rendered only when `canWrite`; `disabled={unblockDriver.isPending}`; `onClick` calls `unblockDriver.mutate({ id, driver_id, driver_name })`
- "Disponível na Phase 9" placeholder removed
- `ManualBlockDialog`: inline Dialog component in BloqueiosTab.tsx with `driver_id`, `driver_name`, `motivo` (required, maxLength=500) inputs; calls `blockDriver.mutate`; inline error display
- Toolbar button "Bloqueio manual" rendered only when `canWrite`, opens `ManualBlockDialog`
- After unblock/block success: TanStack Query invalidation (`['ranking', 'blocks'|'drivers'|'stats'|'logs']`) removes/adds rows

## Verification

- `npx tsc --noEmit` exit 0
- `bun run build` exit 0 (3160 modules, no errors)
- `grep useEvaluateTrip EvaluationFormDialog.tsx` — present (line 21, 61)
- `grep -c "Disponível na Phase 9|PHASE9_NOTICE" EvaluationFormDialog.tsx` — 0
- `grep -c "Disponível na Phase 9" BloqueiosTab.tsx` — 0
- `grep useCanWriteRanking EvaluationFormDialog.tsx` — present (line 62)
- `grep useCanWriteRanking ViagensTab.tsx` — present (line 70)
- `grep useCanWriteRanking BloqueiosTab.tsx` — present (line 165)
- `grep "atendeu: !noShow" EvaluationFormDialog.tsx` — present (line 83)
- `grep -c ".mutate" BloqueiosTab.tsx` — 2 (unblock + manual block)
- `grep motivo BloqueiosTab.tsx` — present (lines 72, 77, etc.)
- `grep operador EvaluationFormDialog.tsx` — only in comments (not in payload)

## Deviations from Plan

### Auto-applied (no plan deviation — implementation choices)

**1. In-dialog Bloquear button removed (plan allowed this)**
- Plan said: wire to useBlockDriver OR remove to avoid two entry points — documented choice required.
- Chosen: **remove** the in-dialog Bloquear button. BloqueiosTab toolbar has the dedicated manual-block dialog.
- Rationale: Single entry point for manual blocks; cleaner UX; no ambiguity about when to use the eval-form block vs BloqueiosTab block.

**2. ManualBlockDialog as inline component in BloqueiosTab.tsx**
- Plan said: reuse Dialog + Input + Button primitives (consistent UX).
- Implemented as `ManualBlockDialog` function component at the top of BloqueiosTab.tsx (not a separate file), using the same shadcn primitives as EvaluationFormDialog.

## Threat Flags

No new network endpoints, auth paths, or schema changes introduced. All write paths go through existing `useRanking` mutation hooks that call the requireRole-gated backend endpoints.

## Self-Check: PASSED

- EvaluationFormDialog.tsx: exists, wired, tsc clean
- BloqueiosTab.tsx: exists, wired, tsc clean
- ViagensTab.tsx: exists, gated, tsc clean
- Commit 1b45034 present in git log
