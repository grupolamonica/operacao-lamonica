---
phase: 1b
plan: 02
subsystem: torre-de-controle/frontend
tags: [design-system, theming, dark-mode, component-refactor, tailwind-v4]
dependency_graph:
  requires: [1b-01]
  provides: [1b-03]
  affects: [all domain/layout components]
tech_stack:
  added: []
  patterns:
    - CSS var paired tokens via inline style for status/severity badges
    - isDark from useThemeStore for Chart.js/SVG explicit colors
    - Semantic token classes (bg-card, text-foreground, border-border, etc.)
    - success/info button variants added to shadcn CVA
key_files:
  created: []
  modified:
    - torre-de-controle/src/app/layout/AppSidebar.tsx
    - torre-de-controle/src/app/layout/AppLayout.tsx
    - torre-de-controle/src/app/layout/Topbar.tsx
    - torre-de-controle/src/components/domain/KPICard.tsx
    - torre-de-controle/src/components/domain/StatusBadge.tsx
    - torre-de-controle/src/components/domain/SeverityBadge.tsx
    - torre-de-controle/src/components/domain/DataTable.tsx
    - torre-de-controle/src/components/domain/AlertItem.tsx
    - torre-de-controle/src/components/domain/AlertGroupedList.tsx (moved from pages/alertas)
    - torre-de-controle/src/components/domain/SidePanelLayout.tsx
    - torre-de-controle/src/components/domain/SparklineChart.tsx
    - torre-de-controle/src/components/domain/SLAGauge.tsx (moved from pages/alertas)
    - torre-de-controle/src/components/domain/ProgressBar.tsx
    - torre-de-controle/src/components/domain/TripTimeline.tsx
    - torre-de-controle/src/components/domain/DriverAvatar.tsx
    - torre-de-controle/src/components/domain/MapPlaceholder.tsx
    - torre-de-controle/src/components/ui/button.tsx
    - 24 page/page-component files
decisions:
  - StatusBadge/SeverityBadge use inline style with CSS vars (not Tailwind classes) — bg color uses oklch alpha which Tailwind v4 cannot express as a utility
  - Semantic status dot colors in DriverAvatar/OperatorsQueue/MapPlaceholder kept as hex — these are SVG/class contexts where CSS vars cannot resolve inside bg-[...] Tailwind syntax
  - SparklineChart uses key prop with isDark to force React re-mount on theme change (simplest Chart.js re-render strategy)
  - AlertItem uses border-primary/40 and bg-primary/10 for selected state (matches shadcn pattern)
  - DriverDetailPanel on_route badge uses color-mix() instead of hardcoded hex — theme-aware
metrics:
  duration: ~15min
  completed: 2026-04-28T18:11:44Z
  tasks_completed: 9
  files_modified: 40
---

# Phase 1B Plan 02: Components — Refactor to Argon Design + Dark/Light Support

Full Argon design token + dark/light theme applied to all 17 domain components and 5 layout/page components across all 8 routes.

## What Was Done

**T2.B.0 — Hardcoded Color Inventory:** 211 hardcoded color references found and catalogued across 40 files. All replaced with theme tokens except documented allowlist.

**T2.B.1 — Layout Components:** AppSidebar uses sidebar-* vars; AppLayout uses bg-app-background; Topbar gains Sun/Moon theme toggle wired to useThemeStore.

**T2.B.2 — KPICard:** bg-card, border-border, shadow-md, hover:shadow-lg. Argon hex palette updated (2ecc71→2dce89, f39c12→fb6340, e74c3c→f5365c).

**T2.B.3 — Badge Components:** StatusBadge and SeverityBadge use CSS var paired tokens (--status-*-bg / --status-*-fg) via inline style — works correctly in both light and dark themes.

**T2.B.4 — Table Components:** DataTable uses bg-card, bg-secondary headers, hover:bg-accent, border-border. OperationalQueue fully themed.

**T2.B.5 — Button Extension:** Added `success` and `info` variants to shadcn button CVA. Input already uses theme tokens — no change needed.

**T2.B.6 — Panel Components:** SidePanelLayout uses bg-card border-border shadow-lg. TripDetailPanel, DriverDetailPanel, AlertDetailPanel all fully themed.

**T2.B.7 — Chart & Visualization:** SparklineChart reads isDark, passes explicit hex colors to Chart.js. SLAGauge reads isDark for bgStroke (#e3e3e3 light / #3a3a52 dark). ProgressBar uses bg-secondary.

**T2.B.8 — Alert & List Components:** AlertItem uses border-primary/40 + bg-primary/10 for selected state. AlertGroupedList uses bg-card, hover:bg-accent. TripTimeline uses CSS token color map.

**Supplementary fixes:** DriverAvatar, MapPlaceholder, OperatorsQueue, OperationalSummary, TripsInProgressTable, AtRiskTripsTable, ViagensTable, MotoristasTable, all 8 page headers, 3 stub pages — all fully themed.

## Deviations from Plan

### Auto-fixed Issues

None. All changes were within plan scope.

### Minor Adjustments

**1. [Rule 2 - Pattern] AlertDetailPanel resolve button uses `variant="success"` instead of hardcoded green**
- The plan specified `text-green-700 border-green-300 hover:bg-green-50` — replaced with the new `success` button variant added in T2.B.5, which is the correct Argon approach.

**2. [Rule 2 - Pattern] DriverDetailPanel statusBadge uses CSS vars instead of Tailwind bg-*-100 classes**
- statusBadge map converted to inline style with CSS vars — consistent with StatusBadge pattern.

## Hardcoded Colors Remaining (Allowlist)

The following hex colors remain by design — they are semantic status dot indicators used in CSS class contexts where CSS variables cannot be resolved:

| File | Colors | Reason |
|------|--------|--------|
| DriverAvatar.tsx | #2dce89, #95959e | Status dot in bg-[...] Tailwind syntax |
| OperatorsQueue.tsx | #2dce89, #fb6340, #95959e | Status dot in bg-[...] Tailwind syntax |
| ViagensTable.tsx | #f5365c, #fb6340, #2dce89 | Priority dot in bg-[...] Tailwind syntax |
| MapPlaceholder.tsx | #2dce89, #fb6340, #f5365c, #95959e | Map legend dots (dark bg context) |

These are Argon's canonical status colors — they are intentionally constant across both themes (green=on-time, orange=at-risk, red=delayed, gray=no-signal). CSS vars cannot be used inside `bg-[...]` Tailwind v4 syntax for dynamic values.

## Build Result

```
✓ built in 39.56s
0 TypeScript errors
0 ESLint errors blocking build
```

## Known Stubs

None introduced by this plan. Existing stubs (Geofences/Insights/Configurações pages) remain as planned Phase 5/6 work.

## Self-Check: PASSED

- Commit 88bfde0 exists: `feat(1b-02): refactor all components to Argon design tokens with dark/light theme`
- 40 files changed, build passes with 0 errors
- Final grep shows 12 remaining hardcoded refs — all in documented allowlist
