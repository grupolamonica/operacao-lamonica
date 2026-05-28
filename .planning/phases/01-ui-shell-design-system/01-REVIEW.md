---
status: issues_found
phase: 01
files_reviewed: 64
findings:
  critical: 0
  warning: 7
  info: 6
  total: 13
reviewed_at: 2026-04-28
depth: standard
files_reviewed_list:
  - torre-de-controle/src/App.tsx
  - torre-de-controle/src/main.tsx
  - torre-de-controle/src/index.css
  - torre-de-controle/src/lib/utils.ts
  - torre-de-controle/src/lib/formatters.ts
  - torre-de-controle/src/stores/useUIStore.ts
  - torre-de-controle/src/app/router.tsx
  - torre-de-controle/src/app/layout/AppLayout.tsx
  - torre-de-controle/src/app/layout/AppSidebar.tsx
  - torre-de-controle/src/app/layout/Topbar.tsx
  - torre-de-controle/src/components/domain/StatusBadge.tsx
  - torre-de-controle/src/components/domain/SeverityBadge.tsx
  - torre-de-controle/src/components/domain/KPICard.tsx
  - torre-de-controle/src/components/domain/SparklineChart.tsx
  - torre-de-controle/src/components/domain/ProgressBar.tsx
  - torre-de-controle/src/components/domain/DriverAvatar.tsx
  - torre-de-controle/src/components/domain/DataTable.tsx
  - torre-de-controle/src/components/domain/SidePanelLayout.tsx
  - torre-de-controle/src/components/domain/TableWithSidePanel.tsx
  - torre-de-controle/src/components/domain/AlertItem.tsx
  - torre-de-controle/src/components/domain/TripTimeline.tsx
  - torre-de-controle/src/components/domain/MapPlaceholder.tsx
  - torre-de-controle/src/data/types.ts
  - torre-de-controle/src/data/mocks/trips.ts
  - torre-de-controle/src/data/mocks/drivers.ts
  - torre-de-controle/src/data/mocks/alerts.ts
  - torre-de-controle/src/data/mocks/kpis.ts
  - torre-de-controle/src/data/mocks/timelineEvents.ts
  - torre-de-controle/src/data/mocks/index.ts
  - torre-de-controle/src/hooks/useTrips.ts
  - torre-de-controle/src/hooks/useDrivers.ts
  - torre-de-controle/src/hooks/useAlerts.ts
  - torre-de-controle/src/hooks/useDashboardKPIs.ts
  - torre-de-controle/src/hooks/useTripTimeline.ts
  - torre-de-controle/src/hooks/index.ts
  - torre-de-controle/src/app/pages/dashboard/DashboardPage.tsx
  - torre-de-controle/src/app/pages/dashboard/components/DashboardKPIRow.tsx
  - torre-de-controle/src/app/pages/dashboard/components/TripsInProgressTable.tsx
  - torre-de-controle/src/app/pages/dashboard/components/ExceptionsAlertsPanel.tsx
  - torre-de-controle/src/app/pages/dashboard/components/OperationalSummary.tsx
  - torre-de-controle/src/app/pages/torre-de-controle/TorreDeControlePage.tsx
  - torre-de-controle/src/app/pages/torre-de-controle/components/TorreKPIRow.tsx
  - torre-de-controle/src/app/pages/torre-de-controle/components/AtRiskTripsTable.tsx
  - torre-de-controle/src/app/pages/torre-de-controle/components/OperationalQueue.tsx
  - torre-de-controle/src/app/pages/torre-de-controle/components/OperatorsQueue.tsx
  - torre-de-controle/src/app/pages/viagens/ViagensPage.tsx
  - torre-de-controle/src/app/pages/viagens/components/ViagensKPIRow.tsx
  - torre-de-controle/src/app/pages/viagens/components/ViagensTabs.tsx
  - torre-de-controle/src/app/pages/viagens/components/ViagensFiltersPanel.tsx
  - torre-de-controle/src/app/pages/viagens/components/ViagensTable.tsx
  - torre-de-controle/src/app/pages/viagens/components/TripDetailPanel.tsx
  - torre-de-controle/src/app/pages/motoristas/MotoristasPage.tsx
  - torre-de-controle/src/app/pages/motoristas/components/MotoristasKPIRow.tsx
  - torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx
  - torre-de-controle/src/app/pages/motoristas/components/DriverDetailPanel.tsx
  - torre-de-controle/src/app/pages/alertas/AlertasPage.tsx
  - torre-de-controle/src/app/pages/alertas/components/AlertasKPIRow.tsx
  - torre-de-controle/src/app/pages/alertas/components/AlertasFiltersBar.tsx
  - torre-de-controle/src/app/pages/alertas/components/AlertGroupedList.tsx
  - torre-de-controle/src/app/pages/alertas/components/AlertDetailPanel.tsx
  - torre-de-controle/src/app/pages/alertas/components/SLAGauge.tsx
  - torre-de-controle/src/app/pages/geofences/GeofencesPage.tsx
  - torre-de-controle/src/app/pages/insights/InsightsPage.tsx
  - torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-28T00:00:00Z
**Depth:** standard
**Files Reviewed:** 64
**Status:** issues_found

## Summary

Phase 1 is a well-structured React/TypeScript frontend shell with mock data only. No real API calls, no auth, no user-controlled system boundaries — security scope is minimal and correctly scoped.

Architecture is clean: hooks abstract data access behind a stable contract (isLoading/isError/error/refetch) that will survive the Phase 2 API migration with minimal changes. Component coupling is appropriately low; state lives in Zustand UIStore for cross-page selections; domain primitives (KPICard, StatusBadge, DataTable, etc.) are reusable and typed.

Seven warnings found — none are crashes, but five will cause incorrect rendering or stale-state behavior that will be harder to fix once real data flows in. Two warnings concern Phase 2 migration correctness. Six info items are quality/maintainability concerns.

No critical issues found.

---

## Warnings

### WR-01: `useTrips` filter memoization uses object identity — causes infinite re-renders

**File:** `torre-de-controle/src/hooks/useTrips.ts:14`
**Issue:** `useMemo` depends on the `filters` object reference. Every caller that passes an inline object literal (e.g., `useTrips({ status: 'in_progress' })`) creates a new object on each render, invalidating the memo every cycle. The same pattern exists in `useDrivers` and `useAlerts`.

In Phase 1 the performance impact is negligible (mock data, no side effects). In Phase 2 this will cause a real API fetch to fire on every render when callers pass inline filter objects.

**Fix:** Callers must either memoize the filter object, or the hooks must accept individual filter parameters and build the memo dependency from primitives:
```ts
// Option A — caller memoizes (preferred for hook simplicity)
const filters = useMemo(() => ({ status: 'in_progress' as TripStatus }), [])
const { data: trips } = useTrips(filters)

// Option B — hook destructs filters before memo dep array
export function useTrips(filters?: TripFilters): UseTripsReturn {
  const { status, slaStatus, clientName, driverName, priority, routeCode, search } = filters ?? {}
  const data = useMemo(() => {
    // ...filter logic...
  }, [status, slaStatus, clientName, driverName, priority, routeCode, search])
  // ...
}
```
Option B is more robust as it protects against all callers. Same fix needed in `useDrivers.ts:14` and `useAlerts.ts:14`.

---

### WR-02: `DriverAvatar` can throw on empty `name`

**File:** `torre-de-controle/src/components/domain/DriverAvatar.tsx:22`
**Issue:** `name.split(' ').slice(0, 2).map(n => n[0])` — `n[0]` is `undefined` if `n` is an empty string (e.g., `name = " "` produces `['', '']` after split). `undefined` renders visibly as nothing but `join` produces `"undefined"` in older TS targets. More importantly, when Phase 2 supplies real API data, names may be empty/null/undefined — this will crash with `Cannot read properties of undefined (reading '0')`.

**Fix:**
```ts
const initials = name
  .split(' ')
  .filter(Boolean)
  .slice(0, 2)
  .map(n => n[0].toUpperCase())
  .join('')
  || '?'
```

---

### WR-03: `ViagensFiltersPanel` uses unsafe type cast to add `operationName` filter

**File:** `torre-de-controle/src/app/pages/viagens/components/ViagensFiltersPanel.tsx:56-58`
**Issue:** `operationName` is not a field in `TripFilters` (defined in `types.ts:161-169`), so the component works around it with `as Record<string, unknown>` cast and a comment-free workaround. The filter has no effect because `useTrips` never reads `operationName` from the filters object. The UI shows a functional-looking dropdown that silently does nothing.

**Fix:** Either add `operationName?: string` to `TripFilters` and add the corresponding filter predicate in `useTrips`, or remove the "Operação" filter from the UI. Leaving the silent no-op in place will confuse Phase 2 work:
```ts
// In types.ts, TripFilters:
export interface TripFilters {
  // ... existing fields ...
  operationName?: string   // add this
}

// In useTrips.ts filter chain:
(!filters.operationName || t.operationName === filters.operationName) &&
```

---

### WR-04: `AlertasFiltersBar` `__unassigned` sentinel value passes through to hook unfiltered

**File:** `torre-de-controle/src/app/pages/alertas/components/AlertasFiltersBar.tsx:67`
**Issue:** The "Não atribuído" option sets `filters.assignedTo = '__unassigned'`. `useAlerts` then filters `a.assignedTo === '__unassigned'`, which never matches real data (assignedTo values are `'op-001'`, `'op-002'` or undefined). The "Não atribuído" selection silently returns zero results instead of returning alerts where `assignedTo` is undefined.

**Fix:** Either handle the sentinel in `useAlerts`, or use `undefined` for the unassigned case and add a separate boolean filter for "unassigned only":
```ts
// In useAlerts.ts, replace assignedTo filter predicate:
(!filters.assignedTo || (
  filters.assignedTo === '__unassigned'
    ? a.assignedTo === undefined
    : a.assignedTo === filters.assignedTo
)) &&
```

---

### WR-05: `AlertsFiltersBar` filter for `period` is a no-op — `useAlerts` ignores it

**File:** `torre-de-controle/src/hooks/useAlerts.ts:13-30` and `torre-de-controle/src/app/pages/alertas/AlertasPage.tsx:11`
**Issue:** `AlertFilters` has a `period` field (`'today' | '7d' | '30d'`). `AlertasPage` initializes filters with `{ period: 'today' }` and `AlertasFiltersBar` lets the user change it. But `useAlerts` never applies the `period` filter — the predicate chain has no `period` branch. All alerts are shown regardless of the selected period, and the default `'today'` filter has no effect.

This is a mock-phase gap, but it will be easy to overlook during Phase 2 if the API does server-side filtering and the `period` param is simply passed through without the front-end filter being implemented.

**Fix:** Add period filtering in `useAlerts`:
```ts
(!filters.period || (() => {
  const now = Date.now()
  const cutoff = filters.period === '7d' ? now - 7 * 86_400_000
    : filters.period === '30d' ? now - 30 * 86_400_000
    : new Date().setHours(0, 0, 0, 0)
  return a.occurredAt.getTime() >= cutoff
})()) &&
```

---

### WR-06: `DataTable` `pageSize` prop change does not reset `pagination` state

**File:** `torre-de-controle/src/components/domain/DataTable.tsx:32`
**Issue:** `pagination` state is initialized from `pageSize` prop via `useState({ pageIndex: 0, pageSize })`. If the parent re-renders with a different `pageSize` (not currently happening in Phase 1, but `pageSize` is an external prop), the state is not updated. This is a React `useState` with initial-value-only semantics — the new prop is silently ignored after mount.

**Fix:**
```ts
// Add a useEffect to sync pageSize changes:
useEffect(() => {
  setPagination(p => ({ ...p, pageSize }))
}, [pageSize])
```

---

### WR-07: `AppSidebar` "Recolher menu" button has no click handler — calls shadcn sidebar toggle

**File:** `torre-de-controle/src/app/layout/AppSidebar.tsx:75-80`
**Issue:** The footer `<button>` has no `onClick` handler. The component comment at the top of `useUIStore.ts` correctly notes that sidebar collapse is managed by shadcn's `useSidebar()`. But the button does nothing — it does not call `useSidebar().toggleSidebar()`. The collapse only works via the `SidebarTrigger` in `Topbar.tsx`.

**Fix:**
```tsx
import { useSidebar } from '@/components/ui/sidebar'

// Inside AppSidebar:
const { toggleSidebar } = useSidebar()
// ...
<button onClick={toggleSidebar} className="flex items-center gap-2 px-3 py-2 text-xs text-[#8892b0] hover:text-white">
```

---

## Info

### IN-01: `App.tsx` is dead code — should be deleted, not kept as empty export

**File:** `torre-de-controle/src/App.tsx:1-5`
**Issue:** File comment acknowledges it is unused. An empty `export default function App()` adds noise and may confuse future contributors who import it expecting the root component.
**Fix:** Delete the file. Verify no lingering imports remain (none found in the reviewed files).

---

### IN-02: Hardcoded date in `Topbar` search bar

**File:** `torre-de-controle/src/app/layout/Topbar.tsx:22`
**Issue:** `"20/05/2025 00:00 — 20/05/2025 23:59"` is a literal string, not derived from state. The date filter button is entirely inert — no state, no onChange.
**Fix:** Move to a state variable or connect to `useUIStore` when the date range picker is implemented in Phase 2. For now, at minimum use `new Date()` to display today's date dynamically so the UI does not show a stale date from development.

---

### IN-03: `OperatorsQueue` hardcodes operators list inside the component

**File:** `torre-de-controle/src/app/pages/torre-de-controle/components/OperatorsQueue.tsx:11-17`
**Issue:** Operator data is a module-level const inside the component file instead of following the mock pattern established by the rest of the codebase (data in `src/data/mocks/`, hook in `src/hooks/`). When Phase 2 introduces real operator data via API, this component will require a different refactor path than all other components.
**Fix:** Extract to `src/data/mocks/operators.ts` + `src/hooks/useOperators.ts` following the existing hook contract pattern.

---

### IN-04: `console.log` statements in production-path event handlers

**File:** `torre-de-controle/src/app/pages/torre-de-controle/components/OperationalQueue.tsx:11-12`
**Issue:** `handleAssume` and `handleCall` log to console. In a production build these will be visible in browser devtools.
**Fix:** Remove or replace with a no-op stub comment indicating the Phase 2 API call point:
```ts
const handleAssume = (_id: string) => { /* TODO Phase 2: POST /alerts/:id/assume */ }
const handleCall   = (_id: string) => { /* TODO Phase 2: initiate call flow */ }
```

---

### IN-05: `SlaStatus` type is re-declared in `StatusBadge.tsx`, creating a divergence risk

**File:** `torre-de-controle/src/components/domain/StatusBadge.tsx:10`
**Issue:** `export type SlaStatus = keyof typeof config` is a local re-declaration. The canonical `SlaStatus` is in `types.ts:2`. If `types.ts` adds a new SLA status (e.g., `'cancelado'`), `StatusBadge.tsx` will not fail at compile time — it will just not have a label/style for the new value and silently destructure `undefined` on line 18 (`const { label, classes } = config[status]`), causing a runtime crash.

Same issue in `SeverityBadge.tsx:9` for `AlertSeverity`.

**Fix:** Replace the local type alias with an import from `types.ts` and add a runtime guard:
```ts
import type { SlaStatus } from '@/data/types'
// ...
const { label, classes } = config[status] ?? { label: status, classes: 'bg-gray-100 text-gray-500' }
```

---

### IN-06: `ViagensFiltersPanel` `sticky top-0` without a scroll container is ineffective

**File:** `torre-de-controle/src/app/pages/viagens/components/ViagensFiltersPanel.tsx:23`
**Issue:** `sticky top-0` only works when the element's nearest scrollable ancestor is the parent element. The filter panel is inside a grid column inside `main.overflow-auto`. It will stick to the top of the viewport only if the page scroll context is the `main` element, which it is — but the `lg:col-span-3` grid cell does not have a fixed height, so the sidebar will scroll away if the table is taller than the filter panel. This is a layout issue that will become visible with real data.
**Fix:** Add `self-start` to the sidebar `<aside>` to prevent it from stretching to full grid-row height and losing sticky behavior:
```tsx
<aside className="bg-white border border-gray-200 rounded-lg p-4 space-y-4 sticky top-0 self-start">
```

---

_Reviewed: 2026-04-28T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
