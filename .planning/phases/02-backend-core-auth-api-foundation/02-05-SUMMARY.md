---
phase: 02-backend-core-auth-api-foundation
plan: "05"
subsystem: api/modules
tags: [trips, drivers, alerts, vehicles, dashboard, redis-cache, drizzle-query]
key_files:
  created:
    - api/src/modules/trips/trips.service.ts
    - api/src/modules/trips/trips.plugin.ts
    - api/src/modules/drivers/drivers.service.ts
    - api/src/modules/drivers/drivers.plugin.ts
    - api/src/modules/alerts/alerts.service.ts
    - api/src/modules/alerts/alerts.plugin.ts
    - api/src/modules/vehicles/vehicles.service.ts
    - api/src/modules/vehicles/vehicles.plugin.ts
    - api/src/modules/dashboard/dashboard.service.ts
    - api/src/modules/dashboard/dashboard.plugin.ts
metrics:
  duration: ~12min
  completed: "2026-05-28"
  tasks: 4
  files: 10
---

# Phase 02 Plan 05: CRUD Modules — Trips, Drivers, Alerts, Vehicles, Dashboard

## Route Inventory

| Method | Path | Module | Auth |
|--------|------|--------|------|
| GET | /api/trips | trips | authGuard |
| GET | /api/trips/stats | trips | authGuard |
| GET | /api/trips/:id | trips | authGuard |
| GET | /api/drivers | drivers | authGuard |
| GET | /api/drivers/stats | drivers | authGuard |
| GET | /api/drivers/:id | drivers | authGuard |
| GET | /api/alerts | alerts | authGuard |
| GET | /api/alerts/stats | alerts | authGuard |
| PATCH | /api/alerts/:id/assign | alerts | authGuard |
| POST | /api/alerts/:id/treatments | alerts | authGuard |
| PATCH | /api/alerts/:id/resolve | alerts | authGuard |
| GET | /api/vehicles | vehicles | authGuard |
| GET | /api/dashboard/kpis | dashboard | authGuard |

## Filter Param Mapping (frontend hook → API)

| Frontend hook | Filter params | API endpoint |
|--------------|---------------|--------------|
| useTrips | status, slaStatus, clientName, driverName, priority, routeCode, search, page, limit | GET /api/trips |
| useDrivers | status, base, search | GET /api/drivers |
| useAlerts | severity, status, type, clientName, routeCode, assignedTo, period, search | GET /api/alerts |

**No deviations from useTrips/useDrivers/useAlerts contracts** — zero-churn Phase 3 migration.

## KPI Shapes Delivered

- **KPIViagens**: total.count, noPrazo.{count,pct}, emRisco.{count,pct}, atrasadas.{count,pct}, progressoMedio.pct
- **KPIMotoristas**: ativos.{count,total}, disponiveis.count, emRota.count, comAtraso.count, documentosVencendo.count
- **KPIAlertas**: criticos.count, abertos.count, resolvidosHoje.count, slaTratativas.pct
- **KPIDashboard**: entregas.{onTime,total,pct}, sla.{pct,meta}, motoristasEmRisco/atrasosCriticos/paradasNaoPlanejadas.{count,total,sparkline}

## Dashboard Redis Cache
Key: `kpi:dashboard`, TTL: 30s. Cache-aside pattern — read first, fall back to DB, write result.

## Note for Plan 06 Composers
Plugins to compose in `api/src/index.ts`:
- authPlugin (from Plan 04)
- tripsPlugin, driversPlugin, alertsPlugin, vehiclesPlugin, dashboardPlugin (this plan)

## Self-Check: PASSED
- All 10 files created ✓
- All plugins use `.use(authGuard)` ✓
- Filter params match hook contracts ✓
- Redis cache key `kpi:dashboard` EX 30 ✓
- tsc --noEmit EXIT 0 ✓
