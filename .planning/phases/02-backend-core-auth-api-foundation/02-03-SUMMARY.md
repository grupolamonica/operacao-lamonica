---
phase: 02-backend-core-auth-api-foundation
plan: "03"
subsystem: api/db/redis/seed
tags: [drizzle, postgresql, redis, ioredis, seed, bun]
dependency_graph:
  requires: ["02-01", "02-02"]
  provides: [db-client, redis-client, seeded-db]
  affects: [api/src/db/client.ts, api/src/redis/client.ts, api/drizzle.config.ts, api/src/db/seed]
tech_stack:
  patterns: [drizzle-kit push, singleton client, idempotent seed]
key_files:
  created:
    - api/drizzle.config.ts
    - api/src/db/client.ts
    - api/src/redis/client.ts
    - api/src/db/seed/reset.ts
    - api/src/db/seed/index.ts
decisions:
  - "drizzle-kit push used (not generate+migrate) — MVP path per plan"
  - "--force flag used on drizzle-kit push (non-TTY environment)"
  - "Seed production guard: exits non-zero if NODE_ENV=production unless FORCE_SEED=1"
metrics:
  duration: ~10min
  completed: "2026-05-28"
  tasks: 3
  files: 5
---

# Phase 02 Plan 03: DB Client, Redis Client, Drizzle Config, Seed Data

## Deliverables

- `api/drizzle.config.ts` — drizzle-kit config pointing to schema/index.ts, dialect postgresql
- `api/src/db/client.ts` — singleton Drizzle client (postgres.js driver), exports `db` + `DB` type
- `api/src/redis/client.ts` — singleton ioredis client, exports `redis` + `RedisClient` type
- `api/src/db/seed/reset.ts` — TRUNCATE all tables RESTART IDENTITY CASCADE
- `api/src/db/seed/index.ts` — Brazilian realistic seed data

## Schema Push

drizzle-kit push applied all 9 tables to torre_controle DB. Used `--force` flag (non-TTY shell).

All 9 tables confirmed: `alerts, clients, driver_documents, drivers, routes, treatments, trips, users, vehicles`

## Seed Row Counts

| Table | Count |
|-------|-------|
| users | 4 |
| clients | 5 |
| routes | 10 |
| drivers | 22 |
| vehicles | 22 |
| driver_documents | 66 |
| trips | 60 |
| alerts | 18 |

## Enum Coverage (D-08)

- Trip status: `delayed, completed, planned, in_progress` ✓
- Alert severity: `baixo, critico, medio` ✓
- Clients: Shopee, Magazine Luiza, Mercado Livre, Americanas, Casas Bahia ✓

## Seeded Users (senha123)

| Email | Role |
|-------|------|
| admin@torre.fic | admin |
| supervisor@torre.fic | supervisor |
| analista@torre.fic | analyst |
| viewer@torre.fic | viewer |

**Default password: `senha123`** — DEV ONLY. Production seed requires FORCE_SEED=1 override.

## TypeScript

`bun --bun tsc --noEmit` — EXIT 0

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1-3 | bc8df46 | feat(api): DB client, Redis client, drizzle config, seed data — Plan 02-03 |

## Self-Check: PASSED

- api/drizzle.config.ts — FOUND, dialect postgresql ✓
- api/src/db/client.ts — exports `db` ✓
- api/src/redis/client.ts — exports `redis` ✓
- api/src/db/seed/index.ts — FOUND, Shopee/Magazine Luiza/Mercado Livre ✓
- 9 tables in DB ✓
- 60 trips with all status values ✓
- tsc --noEmit EXIT 0 ✓
