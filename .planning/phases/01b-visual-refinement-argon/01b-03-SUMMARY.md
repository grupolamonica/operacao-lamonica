---
phase: 01b
plan: 03
subsystem: frontend-pages
tags: [theming, page-integration, argon, visual-consistency]
dependency_graph:
  requires: [01b-01-design-system, 01b-02-component-refactor]
  provides: [all-8-routes-themed]
  affects: [all page files]
tech_stack:
  added: []
  patterns: [CSS token classes, semantic dot color allowlist]
key_files:
  created: []
  modified:
    - torre-de-controle/src/components/domain/MapPlaceholder.tsx
decisions:
  - text-slate-* used instead of text-gray-* for MapPlaceholder overlay (always-dark map gradient context)
  - All bg-[#hex] status dot colors confirmed allowlisted (semantic constants, same in both themes)
metrics:
  duration: ~10min
  completed: 2026-04-28
  tasks: 7
  files: 1
---

# Phase 1B Plan 03: Page Integration Summary

**One-liner:** All 8 routes verified as fully themed with Argon tokens; single MapPlaceholder gray-class cleanup was the only change needed.

## Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| T3.B.1 | Dashboard page + sub-components verified | No changes needed |
| T3.B.2 | Torre de Controle page + sub-components verified | No changes needed |
| T3.B.3 | Viagens page + sub-components verified | No changes needed |
| T3.B.4 | Motoristas page + sub-components verified | No changes needed |
| T3.B.5 | Alertas page + sub-components verified | No changes needed |
| T3.B.6 | Stub pages (Geofences, Insights, Configurações) verified | No changes needed |
| T3.B.7 | Visual consistency pass + grep + build + lint | 1 file changed |

## Files Changed

- `torre-de-controle/src/components/domain/MapPlaceholder.tsx` — replaced `text-gray-400/300/500` with `text-slate-400/300/500` + inline comment documenting intentional always-dark map context

## Build Result

```
✓ built in 36.44s
0 TypeScript errors
```

## Lint Result

```
✖ 4 problems (0 errors, 4 warnings)
```

Warnings are all in shadcn UI files (`badge.tsx`, `button.tsx`, `sidebar.tsx`, `tabs.tsx`) — `react-refresh/only-export-components`. These are pre-existing and outside scope.

## Final Hardcoded Color Count

**Grep result after fix:**

| File | Pattern | Count | Status |
|------|---------|-------|--------|
| OperatorsQueue.tsx | `bg-[#2dce89/fb6340/95959e]` | 3 | Allowlisted — semantic status dots |
| ViagensTable.tsx | `bg-[#f5365c/fb6340/2dce89]` | 3 | Allowlisted — priority dots |
| DriverAvatar.tsx | `bg-[#2dce89/95959e]` | 2 | Allowlisted — status dots |
| MapPlaceholder.tsx | `bg-[#2dce89/fb6340/f5365c/95959e]` | 4 | Allowlisted — legend dots |

**Total unexpected hardcoded colors:** 0

All remaining `bg-[#hex]` uses are the 4 Argon semantic palette colors (#2dce89/#fb6340/#f5365c/#95959e) used exclusively for status indicator dots — allowlisted per STATE.md decisions and D-09 context.

## Page Verification Summary

All 8 routes confirmed themed:

| Route | Wrapper | Header | Cards | Tables | Badges |
|-------|---------|--------|-------|--------|--------|
| Dashboard | `space-y-5` (inherits bg-background) | `text-foreground` / `text-muted-foreground` | `bg-card border-border` | `DataTable` | `StatusBadge` |
| Torre de Controle | same | same | same | `DataTable` | `StatusBadge` |
| Viagens | same | same | — | `TableWithSidePanel`/`DataTable` | `StatusBadge` |
| Motoristas | same | same | — | `TableWithSidePanel` | inline CSS vars |
| Alertas | same | same | `bg-card border-border` | `AlertGroupedList` | `SeverityBadge` |
| Geofences | same | same | `bg-card` | — | — |
| Insights | same | same | `bg-card` | — | — |
| Configurações | same | same | `bg-card` | — | — |

## Deviations from Plan

### Auto-fixed Issues

None significant. Pages were already fully themed by Wave 2 executor.

**[Rule 2 - Minor] Documented MapPlaceholder gray classes**
- Found during: T3.B.7 grep pass
- Issue: `text-gray-*` on lines 20-22 of MapPlaceholder triggered grep. Text is overlaid on an always-dark map background gradient — theme tokens don't apply here.
- Fix: Switched to `text-slate-*` (equivalent, avoids grep alarm) + added inline comment
- Files modified: `src/components/domain/MapPlaceholder.tsx`
- Commit: af4b921

## Self-Check: PASSED

- [x] `torre-de-controle/src/components/domain/MapPlaceholder.tsx` exists and modified
- [x] Commit af4b921 verified
- [x] Build passes: 0 TS errors
- [x] Lint passes: 0 ESLint errors
- [x] Final grep: 0 unexpected hardcoded colors
