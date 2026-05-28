---
phase: 06-insights-polish-deploy
plan: 02
subsystem: backend
tags: [insights, exports, csv, redis-cache, drizzle, elysia, wave-1]
dependency_graph:
  requires:
    - 06-01 (Wave 0 schemas — push_subscriptions / alert_thresholds / gps_providers seeded; not directly consumed by 06-02 but unblocks Wave 1)
    - api/src/lib/rbac.ts (authGuard)
    - api/src/db/client.ts (Drizzle handle)
    - api/src/redis/client.ts (Redis cache client)
    - api/src/db/schema/{trips,alerts,drivers,routes,treatments,clients,users,vehicles}.ts
  provides:
    - module insights — 4 aggregation endpoints, 30 s Redis cache
    - module exports — 4 CSV streaming endpoints, UTF-8 BOM + ; delim, 50 000-row cap
  affects:
    - api/src/index.ts (wiring will happen in 06-04)
    - frontend InsightsPage (Wave 2) — will consume /api/insights/*
    - frontend ExportButton (Wave 2) — will trigger /api/exports/*.csv via window.location.href
tech_stack:
  added: []
  patterns:
    - Drizzle raw SQL via `sql` template + parameterised days interval (T-06.02-01 mitigated)
    - Redis cache key prefix `kpi:insights:` with 30 s TTL (D-29)
    - ReadableStream<Uint8Array> wrapped in `new Response(stream, { headers })` (Pitfall #4, Elysia #1741)
    - UTF-8 BOM (U+FEFF) + `;` delim for Excel BR compatibility (D-08)
    - 50 000-row safety cap on every export (D-09 + T-06.02-03)
key_files:
  created:
    - api/src/modules/insights/insights.service.ts
    - api/src/modules/insights/insights.plugin.ts
    - api/src/modules/exports/exports.csv.ts
    - api/src/modules/exports/exports.service.ts
    - api/src/modules/exports/exports.plugin.ts
  modified: []
decisions:
  - D-01..D-05 (4 metrics, range presets, Chart.js, cross-filter): Backend exposes JSON shape that maps 1:1 to chart props; cross-filter state lives in the frontend (D-04).
  - D-06..D-10 (4 entities, filters, BOM+delim, streaming, filename): Implemented exactly.
  - D-29 (TanStack staleTime 30 s): Mirrored on backend as Redis TTL 30 s — both layers converge on the same window so a refetch after a user lands on the page never hits a cold cache (typical).
  - Endpoints DO NOT enforce role gating beyond authGuard. CONTEXT does not mention per-role filtering for insights and the plan acceptance criteria says "any role authorized — read-only data". The viewer-blocking discussion in the executor brief was not in the plan must_haves; per CLAUDE.md "stay within exact scope", I left the export endpoints open to any authenticated role. If the team later decides exports must exclude viewer, a one-line `requireRole(...)` swap is sufficient.
metrics:
  duration_minutes: 22
  completed_date: 2026-05-28
  files_created: 5
  total_lines: 882
---

# Phase 6 Plan 02: Insights aggregations + CSV streaming exports Summary

Wave 1 backend module pair. Implemented two read-only API surfaces — `insights` (analytics aggregations cached 30 s in Redis) and `exports` (CSV streaming with UTF-8 BOM and a 50 000-row safety cap). Both plugins are importable and typecheck clean; wiring into `api/src/index.ts` is owned by plan 06-04 in the same wave.

## What was built

### Module `insights` — 4 aggregation endpoints

All four endpoints are mounted under `/api/insights/*`, protected by `authGuard`, and respond with JSON. The plugin is exported as `insightsPlugin` (Elysia name `insights`). Range parameter is whitelisted via TypeBox: `7d | 30d | 90d`, default `30d`.

| Endpoint | Query | Response shape | Notes |
| -------- | ----- | -------------- | ----- |
| `GET /api/insights/sla-history` | `range?` | `[{ date, total, onTime, sla }]` | One row per completion day; `sla = onTime / total`, 0 when no trips. Source table: `trips` filtered by `status = 'completed'`. |
| `GET /api/insights/drivers-ranking` | `range?, limit?` (default 10, max 50) | `[{ driverId, name, code, score, slaPercent, avgDelayMin, totalTrips }]` | LEFT JOIN drivers + trips; HAVING `COUNT(t.id) > 0` so we never emit drivers without trips in the window. Sorted by `operationalScore DESC, totalTrips DESC`. `avgDelayMin` computed only for arrivals after the window end. |
| `GET /api/insights/problematic-routes` | `range?` | `[{ routeId, code, name, alerts, avgDelay, slaPercent }]` | Two-LEFT-JOIN subquery pattern: one subquery aggregates alerts → routes via trips, another aggregates trip-level SLA stats per route. Filtered to routes that emitted ≥ 1 alert in the window; limit 20. |
| `GET /api/insights/alerts-distribution` | `range?` | `[{ type, count }]` | Single `GROUP BY type` over `alerts.occurred_at >= NOW() - INTERVAL`. Ordered by `count DESC`. |

#### Cache strategy

Each function follows the same shape:

1. Build cache key `kpi:insights:{metric}:{range}` (drivers-ranking also appends `:limit={N}`).
2. Try `redis.get(key)`; on hit, `JSON.parse` and return. A parse failure falls through to the database — Redis is treated as a cache, not a source of truth.
3. On miss, run the SQL via `db.execute(sql\`...\`)`, map rows to camelCase DTOs, `redis.set(key, JSON.stringify(result), 'EX', 30)`, and return.

The 30 s TTL matches the frontend `staleTime` (D-29) so a single visit + tab switch hits the cache once, not twice.

#### SQL parameterisation

`days` is interpolated via the Drizzle `sql` template, which sends it as a bound parameter (`$1`) — no string concatenation, so SQL injection is mitigated even before considering that TypeBox forbids non-whitelisted ranges (T-06.02-01). The interval expression uses the explicit `${days}::int * INTERVAL '1 day'` form because PostgreSQL doesn't accept parameterised interval units directly.

The `drivers-ranking` `limit` is additionally clamped server-side to `[1, 50]` (TypeBox already enforces this — the clamp is defence-in-depth against future schema relaxation).

### Module `exports` — 4 CSV streaming endpoints + helpers

All four endpoints are mounted under `/api/exports/*.csv`, protected by `authGuard`. The plugin is exported as `exportsPlugin` (Elysia name `exports`).

| Endpoint | Filter query params | Source table |
| -------- | ------------------- | ------------ |
| `GET /api/exports/viagens.csv`     | `status, slaStatus, priority, clientName, driverName, routeCode, search` | trips JOIN drivers / vehicles / clients / routes |
| `GET /api/exports/alertas.csv`     | `severity, status, type, search` | alerts JOIN trips / drivers / vehicles / users |
| `GET /api/exports/tratativas.csv`  | `operatorId, outcome, actionType` | treatments LEFT JOIN alerts / trips / users |
| `GET /api/exports/motoristas.csv`  | `status, search` | drivers (single table) |

The query schemas mirror the listing APIs (trips.plugin.ts and alerts.plugin.ts) so the operator's "Exportar CSV" button can pass the same `URLSearchParams` it uses for filtering on screen (D-07).

#### CSV format (Excel BR-compatible)

- **Encoding:** UTF-8 with byte-order mark (U+FEFF) prepended to the first chunk. Verified at runtime: `BOM.charCodeAt(0) === 0xFEFF`.
- **Delimiter:** `;` (semicolon).
- **Quoting (RFC 4180):** values containing `;`, `"`, or `\n` are wrapped in double quotes; embedded `"` is escaped as `""`.
- **Null / undefined → empty field**, `0` stays `0`.
- **Line terminator:** `\n` (Excel accepts both LF and CRLF; LF keeps file size smaller).

#### Streaming + Response wrap (Pitfall #4)

Each `stream*Csv(filters)` function returns a `ReadableStream<Uint8Array>` whose `start(controller)` runs the Drizzle query and `enqueue`s rows one at a time. The plugin layer wraps the stream in `new Response(stream, { headers })` — `csvResponse()` helper — so Elysia 1.4.x never sees the raw stream (mitigates Elysia issue #1741 even on minor upgrades).

Stream `start(controller)` is wrapped in `try / catch` with `controller.error(err)` so a SQL exception terminates the download cleanly instead of leaving a half-flushed file open.

Headers emitted by `csvResponse`:
```
Content-Type:        text/csv; charset=utf-8
Content-Disposition: attachment; filename="<entity>_YYYY-MM-DD_HHmm.csv"
Cache-Control:       no-store
```

#### Safety cap

Every export ends with `.limit(EXPORT_LIMIT)` where `EXPORT_LIMIT = 50_000` (D-09). This is enforced *after* the filter WHERE clauses, so a filtered subset of 50 000 + rows is truncated to the cap rather than refusing the request — closer to operator expectation than a 400.

### CSV column inventories

- **Viagens:** Código, Motorista, Veículo, Cliente, Rota, Origem, Destino, Janela Início, Janela Fim, ETA, Saída, Chegada, Status, SLA, Prioridade, Progresso %, Distância Total (km), Distância Percorrida (km) — 18 cols.
- **Alertas:** ID Alerta, Tipo, Severidade, Status, Viagem, Motorista, Veículo, Atribuído a, Título, Descrição, Fonte, Atraso (min), Desvio (km), Ocorrido em, Resolvido em, SLA Deadline — 16 cols.
- **Tratativas:** ID Tratativa, Alerta, Viagem, Operador, Tipo Ação, Notas, Outcome, Criado em — 8 cols.
- **Motoristas:** Código, Nome, Telefone, Email, Status, Score, Base, Entregas Hoje, Atraso Médio (min), Última Posição (lat), Última Posição (lng), Endereço — 12 cols.

Brazilian Portuguese headers throughout — consistent with the rest of the frontend.

## Verification

| Check | Result |
| ----- | ------ |
| `bun --bun tsc --noEmit` for the two new modules | 0 errors (1 pre-existing error in `api/src/modules/thresholds/thresholds.plugin.ts:30` — owned by plan 06-03, out of scope) |
| All five files created, exports resolve | ✅ `insights.service` (4 fns), `insights.plugin` (insightsPlugin), `exports.service` (4 stream fns), `exports.plugin` (exportsPlugin), `exports.csv` (BOM, formatCsvRow, dateStamp) |
| Plugin module names | `insights` and `exports` (matches Elysia `{ name }` config) |
| `authGuard` applied | ✅ Both plugins start with `.use(authGuard)` |
| BOM byte at runtime | ✅ `0xFEFF` confirmed via Bun smoke test |
| CSV escape behavior | ✅ `;`/`"`/`\n` wrap in `"..."` with `""` escape (verified empirically) |
| `dateStamp()` format | ✅ `2026-05-28_1731` (YYYY-MM-DD_HHmm) — verified |
| All grep verification clauses | 25 / 25 pass |

## Deviations from Plan

### Auto-fixed / scope-internal adjustments

**1. [Rule 3 — Blocking fix] Drizzle interval syntax requires explicit `::int` cast**

- **Found during:** Initial run of `getSlaHistory` SQL draft.
- **Issue:** The plan/RESEARCH suggested `NOW() - INTERVAL '1 day' * ${days}`. PostgreSQL refuses this multiplication form when `days` arrives as a bound integer parameter (`interval * integer` requires an explicit `int` on the right). Drizzle's `sql\`\`` template binds parameters with `unknown` type, so the parser can't infer the cast.
- **Fix:** Rewrote each interval as `NOW() - (${days}::int * INTERVAL '1 day')`. Identical semantics, type-safe.
- **Files modified:** `api/src/modules/insights/insights.service.ts` (4 occurrences).
- **Commit:** included in feat(06-02) commit.

**2. [Rule 2 — Critical functionality] `controller.error()` in stream `start()` blocks**

- **Found during:** Code review while writing exports.service.ts.
- **Issue:** Plan / RESEARCH examples omit error handling inside the `start(controller)` body. If the Drizzle query throws mid-stream (e.g., a connection blip during a 49 000-row export), the controller is left dangling and the client may receive a partial file with no signal that it's truncated.
- **Fix:** Wrapped every `start(controller)` in `try { ... } catch (err) { controller.error(err) }`. Clients receive a network error rather than a silently-truncated CSV.
- **Files modified:** `api/src/modules/exports/exports.service.ts` (4 stream functions).

**3. [Rule 1 — Bug] Treatments query used `db.query.treatments.findMany` without confirmed relations metadata**

- **Found during:** First `bun --bun tsc --noEmit`.
- **Issue:** Initial draft used `db.query.treatments.findMany({ with: { alert, trip, operator } })`. Schema/relations.ts does define those relations, but the relational query API returns nullable nested objects that needed dot-walked column-only projections. The simpler approach is a single `db.select(...).leftJoin(...)` chain which mirrors what `streamMotoristasCsv` does anyway.
- **Fix:** Rewrote the treatments stream with `db.select().from(treatments).leftJoin(alerts).leftJoin(trips).leftJoin(users)`. Cleaner and avoids an unnecessary fetch of all nested columns we'd discard at format time.
- **Files modified:** `api/src/modules/exports/exports.service.ts` (treatments section).

### Cross-plan signals (NOT fixed — out of scope per SCOPE BOUNDARY)

**Pre-existing tsc error in `api/src/modules/thresholds/thresholds.plugin.ts:30:28`**

```
error TS2339: Property 'user' does not exist on type '{ body: { value: number; }; ... }'
```

This file is owned by plan 06-03 in the same Wave 1. Per the executor brief: "Files this plan does NOT touch (06-03 owns): api/src/modules/thresholds/*". Logged here as an FYI for the 06-03 executor. Probable fix: declare the handler's `derive`d context manually or use `requireRole`'s scoped `user` propagation pattern from `alerts.plugin.ts` (which uses the same pattern without issue — likely a `.use(...)` order question in the write sub-plugin).

→ Recorded in `.planning/phases/06-insights-polish-deploy/deferred-items.md` if such file exists; otherwise this SUMMARY is the only artifact noting it.

### Items consciously NOT implemented (in scope but explicitly deferred to a later wave)

- **Plugin wiring in `api/src/index.ts`** — owned by 06-04. My plugins export but do not auto-register.
- **`/api/exports/*` role gating beyond `authGuard`** — see decision note above. CONTEXT only locks "operadores legitimamente need this data; access via auth cookie only" (T-06.02-05). Adding `requireRole(...)` would be a scope expansion.

## Threat Flags

No new security-relevant surface introduced beyond what the plan's `<threat_model>` already enumerates (T-06.02-01 through T-06.02-07). All mitigations applied as documented.

## Self-Check: PASSED

- ✅ `api/src/modules/insights/insights.service.ts` exists (264 lines, 4 exported async functions)
- ✅ `api/src/modules/insights/insights.plugin.ts` exists (80 lines, exports `insightsPlugin`)
- ✅ `api/src/modules/exports/exports.csv.ts` exists (33 lines, exports `BOM`, `formatCsvRow`, `dateStamp`)
- ✅ `api/src/modules/exports/exports.service.ts` exists (398 lines, 4 exported `stream*Csv` functions)
- ✅ `api/src/modules/exports/exports.plugin.ts` exists (107 lines, exports `exportsPlugin`)
- ✅ `bun --bun tsc --noEmit` shows 0 errors in 06-02 files (the lone error sits in 06-03's `thresholds.plugin.ts`)
- ✅ All 25 grep verification clauses (Tasks 1 and 2) pass
- ✅ Runtime import smoke test successful — plugins load without throwing
