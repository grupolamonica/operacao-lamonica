---
phase: 06-insights-polish-deploy
plan: 04
subsystem: api
tags: [web-push, vapid, elysia, sentry, alert-engine, drizzle-jsonb, plugin-wiring]

# Dependency graph
requires:
  - phase: 06-01
    provides: "web-push@3.6.7 dep, @sentry/node@10.55.0 dep, api/src/lib/vapid.ts (webpush.setVapidDetails side-effect), api/src/lib/sentry.ts (scaffold), api/src/db/schema/push-subscriptions.ts"
  - phase: 06-02
    provides: "insightsPlugin + exportsPlugin (wired here)"
  - phase: 06-03
    provides: "usersPlugin + thresholdsPlugin + gpsProvidersPlugin (wired here), users.notification_preferences JSONB"
  - phase: 04
    provides: "alert-inline.ts engine entrypoint (insert + redis.publish loop)"
provides:
  - "Web Push backend: subscribe/unsubscribe persistence, sendToUser fan-out with 410/404 cleanup"
  - "dispatchAlertPush — JSONB severity filter ('critico'|'medio'|'baixo') fanning out to all opted-in active users"
  - "Alert engine push hook (fire-and-forget; never blocks alert pipeline)"
  - "Sentry boot side-effect at api/src/index.ts top — initializes when SENTRY_DSN present"
  - "All 6 Phase 6 plugins wired in api/src/index.ts; Swagger lists insights/exports/push/users/thresholds/gps-providers tags"
affects: [06-05, 06-06, 06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Split-plugin pattern for mixed-auth modules: publicKeyPlugin (no auth) + authedPlugin (.use(authGuard)) combined under one exported Elysia plugin"
    - "JSONB ->> text comparison with Drizzle sql template (parameterized) — safe from SQL injection by literal-union TS narrowing"
    - "Fire-and-forget alert push: caller .catch is defense-in-depth; dispatcher internally swallows all errors"
    - "Endpoint URL truncation (40 chars) in all push-related logs — endpoint URL carries auth identifier (T-06.04-08)"

key-files:
  created:
    - "api/src/modules/push/push.service.ts"
    - "api/src/modules/push/push.dispatcher.ts"
    - "api/src/modules/push/push.plugin.ts"
  modified:
    - "api/src/jobs/alert-inline.ts"
    - "api/src/index.ts"

key-decisions:
  - "publicKeyPlugin sits OUTSIDE the auth scope so frontend can fetch VAPID public key before subscribing (RFC 8292 — key is not secret)"
  - "sendToUser short-circuits when isVapidConfigured=false — dev env without VAPID env vars logs a single warn instead of throwing per call"
  - "410 Gone / 404 Not Found from web-push triggers DELETE FROM push_subscriptions WHERE endpoint = ? — push services report dead endpoints this way"
  - "dispatchAlertPush queries users via raw `db.execute(sql\\`SELECT id FROM users WHERE is_active = true AND notification_preferences->>${severity} = 'true'\\`)` — JSONB ->> returns text, compares against literal 'true'"
  - "Alert engine fires push AFTER logger.info('alert created') so log line precedes async dispatch (deterministic log ordering)"
  - "import './lib/sentry' placed at TOP of api/src/index.ts (before Elysia import) so Sentry instrumentation wraps the entire request lifecycle"
  - "wsPlugin remains LAST in the .use() chain (Elysia 1.4 plugin POST order rule — WebSocket upgrade must be the final handler)"
  - "Severity cast: alert.severity from DB is `string`; dispatcher accepts the narrowed literal union — alert-inline.ts asserts via `as 'critico'|'medio'|'baixo'` (column whitelisted at TypeBox layer in alerts.plugin.ts)"

patterns-established:
  - "Phase 6 split-plugin pattern: NoAuthPlugin + AuthedPlugin combined under top-level export (re-used from thresholds/gps-providers)"
  - "Fire-and-forget integration: alert-inline.ts calls dispatchAlertPush(...).catch(err => logger.error(...)) — push never blocks telemetry pipeline"
  - "Sentry side-effect import at file top — no destructured imports needed at index.ts level"

requirements-completed: [PHASE6-WEB-PUSH-DISPATCH, PHASE6-WEB-PUSH-PREFERENCES]

# Metrics
duration: 25min
completed: 2026-05-29
---

# Phase 6 Plan 04: Push Module + Alert Hook + Plugin Wiring Summary

**Web Push backend (subscribe/unsubscribe/sendToUser/dispatchAlertPush) with 410-cleanup; alert engine fire-and-forget push hook; Sentry boot side-effect at index.ts top; all 6 Phase 6 plugins (insights/exports/push/users/thresholds/gps-providers) wired between dashboardPlugin and wsPlugin.**

## Performance

- **Duration:** ~25 min (extended ~10 min by stale-bun-process diagnostic — Windows pkill failed to kill old listeners that masked correct routes)
- **Started:** 2026-05-28T08:00Z
- **Completed:** 2026-05-29T08:35Z
- **Tasks:** 2
- **Files created:** 3
- **Files modified:** 2

## Accomplishments

- `push.service.ts` exposes 4 surface functions: `getVapidPublicKey` (sync; returns null in dev without env), `subscribe` (UPSERT via UNIQUE constraint dedupe), `unsubscribe` (DELETE by endpoint), `sendToUser` (Promise.allSettled fan-out, TTL=60, 410/404 cleanup).
- `push.dispatcher.ts` exports `dispatchAlertPush(alert)` that filters `users WHERE is_active=true AND notification_preferences->>severity='true'` via parameterized Drizzle `sql` template and dispatches via `Promise.allSettled(rows.map(u => sendToUser(u.id, payload)))`. NEVER throws — caller in alert-inline.ts uses fire-and-forget pattern.
- `push.plugin.ts` exposes 3 endpoints: `GET /api/push/vapid-public-key` (public, no auth per RFC 8292), `POST /api/push/subscribe` and `POST /api/push/unsubscribe` (both authGuard-protected, userId derived from JWT).
- `api/src/jobs/alert-inline.ts` imports `dispatchAlertPush` and calls it AFTER `logger.info('alert created')` with `.catch(...)` — deterministic log ordering, push never blocks telemetry.
- `api/src/index.ts` updated:
  - `import './lib/sentry'` at top (line 5) — Sentry instrumentation wraps the entire app
  - 6 plugin imports added (insights/exports/push/users/thresholds/gps-providers)
  - Swagger tags array appended with 6 Phase 6 tag descriptions
  - Plugin chain: `.use(insightsPlugin).use(exportsPlugin).use(pushPlugin).use(usersPlugin).use(thresholdsPlugin).use(gpsProvidersPlugin)` inserted between `dashboardPlugin` and `wsPlugin` (ws stays last per Elysia 1.4 plugin order rule)

## Task Commits

| # | Task                                                  | Commit  | Files                                              |
|---|-------------------------------------------------------|---------|----------------------------------------------------|
| 1 | push module — service + dispatcher + plugin          | 899f008 | push.service.ts, push.dispatcher.ts, push.plugin.ts |
| 2 | wire 6 Phase 6 plugins + sentry boot + alert push hook | 351c1d2 | api/src/index.ts, api/src/jobs/alert-inline.ts     |

## Verification

- `bun --bun tsc --noEmit` → exit 0 (zero TS errors)
- `bun --bun run src/index.ts` boots cleanly with VAPID/SENTRY env unset (logs `VAPID keys missing — push notifications disabled` then `torre-api listening port=3000`)
- After clean process tree:
  - `GET /` → HTTP 200 `{"status":"ok","service":"torre-api","version":"0.2.0"}`
  - `GET /api/push/vapid-public-key` → HTTP 200 `{"publicKey":null}` (null = no VAPID env in dev — expected per `getVapidPublicKey()` short-circuit)
  - `GET /api/insights/sla-history` → HTTP 401 `{"error":"Unauthorized: no session cookie"}` (authGuard correctly active)
  - `GET /api/exports/viagens.csv` → HTTP 401 (authGuard active)
  - `GET /api/thresholds` → HTTP 401 (authGuard active)
- `GET /swagger/json` lists all 6 Phase 6 tag names AND all new paths under those tags (only exception: exports paths absent from swagger JSON due to `.csv` suffix in path — known @elysiajs/swagger quirk; the routes ARE registered and functional, confirmed via direct HTTP)
- `app.routes` introspection confirms 55 routes total registered, including:
  - `/api/insights/*` (4 routes — sla-history, drivers-ranking, problematic-routes, alerts-distribution)
  - `/api/exports/*.csv` (4 routes — viagens, alertas, tratativas, motoristas)
  - `/api/push/*` (3 routes — vapid-public-key, subscribe, unsubscribe)
  - `/api/users/*` (5 routes — me/notification-preferences, list, get-by-id, create, update, soft-delete)
  - `/api/thresholds/*` (2 routes — list, upsert)
  - `/api/gps-providers/*` (5 routes — list, get-by-id, create, update, hard-delete)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale Bun processes on Windows masked plugin chain registration**

- **Found during:** Task 2 smoke verification
- **Issue:** After editing `api/src/index.ts` and restarting via `bun run`, HTTP requests to `/api/push/vapid-public-key` returned `HTTP 500 {"error":"NOT_FOUND","code":"NOT_FOUND","ts":...}` even though `app.routes` introspection showed the route was registered correctly. Direct `app.handle(req)` via in-process import worked (HTTP 200), but HTTP fetch to localhost:3000 failed.
- **Root cause:** Earlier diagnostic bun processes from this session (`pkill -f "bun"` on Git Bash for Windows is unreliable) remained bound to port 3000. Bun's listen() on Windows allows multiple processes to bind the same port; incoming requests load-balance across them. The stale processes had the OLD compiled module cache without the 6 new plugins.
- **Fix:** `taskkill //F //IM bun.exe` reliably kills all bun.exe instances. After clean kill, fresh boot produced 100% expected behavior on every new endpoint.
- **Files modified:** none (process-level issue; STATE.md already documents this as known issue #2)
- **Commit:** N/A (no code change, only process hygiene)

**2. [Rule 2 - Documentation] Added explicit smoke-process-hygiene guidance in SUMMARY for downstream waves**

- **Found during:** Task 2 verification
- **Issue:** Phase 6 STATE.md already lists "Stale processes on port 3000 can mask route changes" as known issue #2, but plan 06-04 did not surface this as a verification-time risk.
- **Fix:** This SUMMARY documents the symptom (`500 NOT_FOUND` despite registered route) and the exact `taskkill //F //IM bun.exe` recovery so 06-05/06-06/06-07/06-08 executors do not re-debug the same trail.
- **Files modified:** none

### Architectural Decisions

- None — no architectural deviations from the plan. All changes implemented exactly as specified.

## Threat Coverage

| Threat ID    | Mitigation Applied                                                                                                                    |
|--------------|---------------------------------------------------------------------------------------------------------------------------------------|
| T-06.04-01   | userId always derived from authGuard JWT in push.plugin.ts; body schema does NOT include userId field                                  |
| T-06.04-02   | UNIQUE constraint on `endpoint` + `onConflictDoNothing` dedupes subscription spam at DB layer                                          |
| T-06.04-03   | alert-inline.ts uses fire-and-forget `dispatchAlertPush(...).catch(...)` — push pipeline failure never blocks alert insert/publish      |
| T-06.04-04   | Accepted — operational PII in payload (driver name, route code) transmitted over HTTPS via push services; required for actionable info |
| T-06.04-05   | VAPID private key only read inside `api/src/lib/vapid.ts` from `process.env`; never serialized or logged                               |
| T-06.04-06   | `severity` typed as 'critico'\|'medio'\|'baixo' literal union; interpolated via Drizzle parameterized `sql` template — no concat        |
| T-06.04-07   | Accepted — MVP user count <50; Promise.allSettled bounded by team size. Future: BullMQ queue (deferred per CONTEXT D-09)               |
| T-06.04-08   | `truncate()` helper limits endpoint URLs to 40 chars + '...' in all push-related logger calls                                          |

## Authentication Gates

None — all VAPID/SENTRY env vars handled gracefully (warn + short-circuit) when absent. Push features no-op in dev without env config. No human action required to complete plan execution.

## Known Limitations / Deferred

- `/api/exports/*.csv` routes register at runtime but don't appear in `/swagger/json` due to `.csv` extension in path — @elysiajs/swagger plugin quirk. Routes are fully functional (verified via direct HTTP 401 auth gate). Not blocking; downstream waves use Eden Treaty (type inference from `app`, not from runtime swagger JSON).
- `dispatchAlertPush` only fans out for alerts persisted via `api/src/jobs/alert-inline.ts` (the inline alert engine). Geofence-triggered alerts published directly to Redis (api/src/index.ts:57-62, `redis.publish('alerts:new', ...)`) bypass the dispatcher because they don't INSERT into `alerts` table. Phase 6 plan 04 scope did not include hooking geofence broadcasts; downstream optimization opportunity for plan 06-08+ if geofence alerts need push notifications.
- Sentry init is conditional on `SENTRY_DSN` env (not configured in dev). When DSN is set, `scrubRecursive` runs on every event per `lib/sentry.ts` (Wave 0 scaffold; T-06.01-01 mitigated).

## Self-Check: PASSED

- `api/src/modules/push/push.service.ts` — exists, exports subscribe/unsubscribe/sendToUser/getVapidPublicKey
- `api/src/modules/push/push.dispatcher.ts` — exists, exports dispatchAlertPush
- `api/src/modules/push/push.plugin.ts` — exists, exports pushPlugin
- `api/src/jobs/alert-inline.ts` — modified, imports dispatchAlertPush, calls it after redis.publish
- `api/src/index.ts` — modified, imports `./lib/sentry`, imports 6 new plugins, swagger tags include all 6 Phase 6 tag names, `.use()` chain includes all 6 plugins between dashboardPlugin and wsPlugin
- Commit `899f008` exists in git log (Task 1)
- Commit `351c1d2` exists in git log (Task 2)
- `bun --bun tsc --noEmit` exits 0
- Smoke test boots and serves expected JSON responses on new endpoints
