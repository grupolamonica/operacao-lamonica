---
phase: 02-backend-core-auth-api-foundation
plan: "02"
subsystem: api/db/schema
tags: [drizzle, postgresql, schema, typescript, orm]
dependency_graph:
  requires: []
  provides: [drizzle-schema, type-exports, relations]
  affects: [api/src/db/index.ts, drizzle.config.ts, seed, Wave3-services]
tech_stack:
  added: [drizzle-orm@0.45.2]
  patterns: [pgTable, $inferSelect/$inferInsert, relations()]
key_files:
  created:
    - api/src/db/schema/users.ts
    - api/src/db/schema/clients.ts
    - api/src/db/schema/routes.ts
    - api/src/db/schema/drivers.ts
    - api/src/db/schema/driver-documents.ts
    - api/src/db/schema/vehicles.ts
    - api/src/db/schema/trips.ts
    - api/src/db/schema/alerts.ts
    - api/src/db/schema/treatments.ts
    - api/src/db/schema/relations.ts
    - api/src/db/schema/index.ts
  modified:
    - api/tsconfig.json
decisions:
  - "Extra driver columns (email, base, deliveriesToday, avgDelayMinutes, lat, lng, address) added beyond ARCHITECTURE.md — required by frontend types.ts Driver interface"
  - "tsconfig ignoreDeprecations set to '6.0' — project uses TypeScript 6.x where baseUrl is deprecated; needed for npx tsc --noEmit to exit 0"
  - "integer removed from trips.ts import — noUnusedLocals flag would otherwise fail compilation"
metrics:
  duration: ~11min
  completed: "2026-04-30"
  tasks: 4
  files: 12
---

# Phase 02 Plan 02: Drizzle Schema — 9 Entities, Relations, Barrel Export

Complete Drizzle ORM schema for all 9 entities required by ARCHITECTURE.md, with FK relations(), composite indexes, and $inferSelect/$inferInsert type exports — ready for `drizzle-kit push` in Plan 03.

## Tables Delivered

| Table | File | Notes |
|-------|------|-------|
| users | users.ts | role varchar 'admin'\|'supervisor'\|'analyst'\|'viewer' |
| clients | clients.ts | name + code unique |
| routes | routes.ts | FK → clients.id |
| drivers | drivers.ts | +7 extra columns vs ARCHITECTURE.md (see below) |
| driver_documents | driver-documents.ts | FK → drivers.id ON DELETE CASCADE |
| vehicles | vehicles.ts | FK → drivers.id |
| trips | trips.ts | All ARCHITECTURE.md columns + 3 composite indexes |
| alerts | alerts.ts | FKs → trips, drivers, vehicles, users; 2 indexes |
| treatments | treatments.ts | FKs → alerts, trips, users |

## Deviations from ARCHITECTURE.md

### Extra columns on `drivers` table (Rule 2 — required by frontend)

Frontend `types.ts` Driver interface requires fields not in ARCHITECTURE.md SQL schema. Added to prevent data loss in Phase 3 API responses:

| Column | SQL name | Reason |
|--------|----------|--------|
| email | email | Driver.email in types.ts |
| base | base | Driver.base (CD São Paulo, etc.) |
| deliveriesToday | deliveries_today | Driver.deliveriesToday |
| avgDelayMinutes | avg_delay_minutes | Driver.avgDelayMinutes (can be negative) |
| lat | lat | Driver current position |
| lng | lng | Driver current position |
| address | address | Driver.address (current location text) |

### tsconfig.json — ignoreDeprecations added

TS 6.0 deprecates `baseUrl` and emits TS5101 error. Added `"ignoreDeprecations": "6.0"` to suppress. This is not a schema file but was required for tsc --noEmit to exit 0.

## Enum String Values

All enum columns use varchar with comments listing valid values — verified against types.ts:

- SlaStatus: `no_prazo | em_risco | atrasado | sem_sinal` (trips.sla_status)
- TripStatus: `planned | in_progress | completed | delayed | cancelled` (trips.status)
- AlertSeverity: `critico | medio | baixo` (alerts.severity)
- AlertStatus: `aberto | em_tratativa | resolvido` (alerts.status)
- DriverStatus: `available | on_route | unavailable` (drivers.status)
- Priority: `alta | media | baixa` (trips.priority)
- DocStatus: `valido | vence_em_breve | vencido` (driver_documents.status)
- AlertType: 7 values listed in alerts.ts comment block

## TypeScript Compile Output

```
npx tsc --noEmit (TypeScript 6.0.3)
EXIT: 0
```

No `error TS` lines. No `@ts-ignore` or `@ts-nocheck` in schema files. Docker was unavailable (daemon not running); validated with npx tsc from locally installed typescript dev dependency.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1-4 | 57442d5 | feat(api): Drizzle schema — 9 entities, relations, barrel export |

## Self-Check: PASSED

- api/src/db/schema/users.ts — FOUND
- api/src/db/schema/clients.ts — FOUND
- api/src/db/schema/routes.ts — FOUND
- api/src/db/schema/drivers.ts — FOUND
- api/src/db/schema/driver-documents.ts — FOUND
- api/src/db/schema/vehicles.ts — FOUND
- api/src/db/schema/trips.ts — FOUND
- api/src/db/schema/alerts.ts — FOUND
- api/src/db/schema/treatments.ts — FOUND
- api/src/db/schema/relations.ts — FOUND
- api/src/db/schema/index.ts — FOUND
- Commit 57442d5 — FOUND
- tsc --noEmit EXIT 0 — PASSED
