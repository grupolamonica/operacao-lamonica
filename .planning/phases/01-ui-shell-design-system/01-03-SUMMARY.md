---
phase: 01-ui-shell-design-system
plan: "03"
subsystem: data-layer
tags: [frontend, types, mock-data, hooks]
dependency_graph:
  requires: [01-01, 01-02]
  provides: [types, mock-data, data-hooks]
  affects: [01-04, 01-05, 01-06]
tech_stack:
  added: []
  patterns: [useMemo-based-filtering, Phase2-compatible-hook-contract]
key_files:
  created:
    - torre-de-controle/src/data/types.ts
    - torre-de-controle/src/data/mocks/drivers.ts
    - torre-de-controle/src/data/mocks/trips.ts
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
  modified: []
decisions:
  - "Hook contract { data, isLoading: false, isError: false, error: null, refetch: () => void } chosen for Phase 2 TanStack Query compatibility — consumers need zero changes on migration"
  - "Mock trips split into canonicalTrips (15) + generatedTrips (30) for testable pagination density without manually writing 45 objects"
  - "Emails use @torre.fic domain to avoid any PII risk; no real names, CPFs, or GPS coordinates of private residences"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-28"
  tasks: 2
  files: 13
---

# Phase 1 Plan 03: Types + Mock Data Summary

**One-liner:** TypeScript domain contracts (Trip/Driver/Alert/KPIs/Filters) plus 45 trips, 22 drivers, 40 alerts in mock data with filtering hooks compatible with Phase 2 TanStack Query.

## Objective Achieved

Defined all TypeScript interfaces for the domain and populated realistic Brazilian logistics mock data covering all 8 application pages. Data hooks abstract access so Phase 2 can swap the body for TanStack Query without changing any consumers.

## Files Created

| File | Lines | Description |
|------|-------|-------------|
| `src/data/types.ts` | 186 | All domain types: Trip, Driver, Alert, Timeline, 5 KPI interfaces, 3 Filter interfaces, 7 union types |
| `src/data/mocks/drivers.ts` | 276 | 22 drivers (10 canonical + 12 generated), @torre.fic emails |
| `src/data/mocks/trips.ts` | 246 | 45 trips (15 canonical + 30 generated), 4 statuses, 4 slaStatuses |
| `src/data/mocks/alerts.ts` | 192 | 40 alerts (15 canonical + 25 generated), all 7 AlertTypes covered |
| `src/data/mocks/kpis.ts` | 42 | 5 KPI objects matching dashboard reference images (SLA 92.6%, meta 95%) |
| `src/data/mocks/timelineEvents.ts` | 37 | Timeline events for trp-001, 002, 005, 007, 008 |
| `src/data/mocks/index.ts` | 7 | Barrel re-exports |
| `src/hooks/useTrips.ts` | 38 | useTrips (6 filters) + useTrip |
| `src/hooks/useDrivers.ts` | 33 | useDrivers (3 filters) + useDriver |
| `src/hooks/useAlerts.ts` | 50 | useAlerts (7 filters) + useAlert + useAlertsBySeverity |
| `src/hooks/useDashboardKPIs.ts` | 22 | useDashboardKPIs + useTorreKPIs + useViagensKPIs + useMotoristasKPIs + useAlertasKPIs |
| `src/hooks/useTripTimeline.ts` | 8 | useTripTimeline(tripId) |
| `src/hooks/index.ts` | 8 | Barrel re-exports |
| **Total** | **1145** | |

## Mock Data Counts

| Entity | Count | Distribution |
|--------|-------|-------------|
| Drivers | 22 | 12 on_route, 6 available, 4 unavailable; bases: SP, Guarulhos, Campinas, Osasco, ABC |
| Trips | 45 | 23 in_progress (10 no_prazo, 5 em_risco, 2 atrasado, 2 sem_sinal), 9 planned, 12 completed, 1 delayed |
| Alerts | 40 | ~14 critico, ~17 medio, ~9 baixo; all 7 AlertTypes covered |

## Hook Contracts

All hooks return the same Phase 2-compatible interface:

```typescript
{ data: T; isLoading: false; isError: false; error: null; refetch: () => void }
```

| Hook | Input | Output Type |
|------|-------|-------------|
| useTrips(filters?) | TripFilters | Trip[] |
| useTrip(id) | string \| null | Trip \| null |
| useDrivers(filters?) | DriverFilters | Driver[] |
| useDriver(id) | string \| null | Driver \| null |
| useAlerts(filters?) | AlertFilters | Alert[] |
| useAlert(id) | string \| null | Alert \| null |
| useAlertsBySeverity() | — | {critico, medio, baixo: Alert[]} |
| useDashboardKPIs() | — | KPIDashboard |
| useTorreKPIs() | — | KPITorre |
| useViagensKPIs() | — | KPIViagens |
| useMotoristasKPIs() | — | KPIMotoristas |
| useAlertasKPIs() | — | KPIAlertas |
| useTripTimeline(tripId) | string \| null | TimelineEvent[] |

## Build Verification

```
npm run build → tsc -b && vite build
✓ 1764 modules transformed
✓ built in 8.31s
dist/assets/index-Cr4xKwW7.js  329.47 kB | gzip: 106.79 kB
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — mock data is fully populated. All hooks return real data arrays; no placeholder text or empty arrays flowing to UI.

## Threat Flags

No new threat surface introduced. All mock data uses @torre.fic domain (no real PII), fictional Brazilian names, and public landmark coordinates only.

## Self-Check: PASSED

- torre-de-controle/src/data/types.ts: FOUND
- torre-de-controle/src/data/mocks/trips.ts: FOUND (45 entries)
- torre-de-controle/src/data/mocks/drivers.ts: FOUND (22 entries)
- torre-de-controle/src/data/mocks/alerts.ts: FOUND (40 entries)
- torre-de-controle/src/hooks/useTrips.ts: FOUND
- torre-de-controle/src/hooks/index.ts: FOUND
- Commits 19b145b (Task 1) and caf1633 (Task 2): FOUND
- Build: PASSED
