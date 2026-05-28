---
phase: 02-backend-core-auth-api-foundation
plan: "06"
subsystem: api/composition
tags: [elysia, cors, swagger, eden-treaty, smoke-test]
key_files:
  created:
    - api/src/index.ts
    - api/src/types/api.ts
    - torre-de-controle/src/types/api.ts
metrics:
  duration: ~8min
  completed: "2026-05-28"
  tasks: 2
  files: 3
---

# Phase 02 Plan 06: App Composition, Swagger, Eden Treaty, Smoke Test

## Smoke Test Results

| Check | Result |
|-------|--------|
| GET / health | ✅ `{"status":"ok","service":"torre-api","version":"0.2.0"}` |
| GET /api/trips (no cookie) | ✅ 401 |
| POST /api/auth/login (admin@torre.fic) | ✅ 200 + `{"user":{"id":"...","role":"admin"}}` |
| Cookie HttpOnly | ✅ `#HttpOnly_localhost ... access_token` |
| GET /api/trips (with cookie) | ✅ 60 trips |
| GET /api/trips/stats | ✅ KPIViagens shape (total.count=36 active) |
| GET /api/drivers | ✅ 22 drivers |
| GET /api/alerts | ✅ 18 alerts |
| GET /api/dashboard/kpis | ✅ `.sla.meta=95` |
| CORS preflight (Origin: localhost:5173) | ✅ `Access-Control-Allow-Credentials: true` + explicit origin |
| POST /api/auth/logout | ✅ 204 |
| GET /api/auth/me after logout | ✅ 401 (Redis blacklist working) |

## Eden Treaty Type Pathway

```
api/src/index.ts → export type App = typeof app
api/src/types/api.ts → export type { App } from '../index'
torre-de-controle/src/types/api.ts → export type { App } from '../../../api/src/types/api'
```

Phase 3 frontend usage:
```typescript
import { treaty } from '@elysiajs/eden'
import type { App } from '@/types/api'
export const api = treaty<App>('http://localhost:3000', { fetch: { credentials: 'include' } })
```

## Phase 3 Hand-off

- Start stack: `docker compose up -d` (postgres + redis + api)
- All filter params match useTrips/useDrivers/useAlerts exactly — zero-churn Eden Treaty migration
- Swagger at http://localhost:3000/swagger (6 tags labeled)
- Seeded users: admin@torre.fic / supervisor@torre.fic / analista@torre.fic / viewer@torre.fic (all senha123)
- `type App` exported and consumable — replace mock hooks with Eden Treaty calls

## Human Checkpoint
Task 3 (browser-based Swagger verify) is pending user approval. Automated smoke tests ✅ fully passed.

## Self-Check: PASSED
- 6 plugins composed ✓
- CORS credentials:true + explicit origin ✓
- Swagger mounted ✓
- export type App = typeof app after all .use() ✓
- Torre types/api.ts type-only re-export ✓
- tsc --noEmit EXIT 0 ✓
