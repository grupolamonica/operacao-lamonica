---
phase: 06-insights-polish-deploy
plan: 03
subsystem: api
tags: [bcrypt, drizzle, elysia, rbac, in-memory-cache, soft-delete, typebox]

# Dependency graph
requires:
  - phase: 06-01
    provides: "users.notification_preferences JSONB column, alert_thresholds table, gps_providers table"
  - phase: 02
    provides: "authGuard, requireRole, bcrypt auth pattern"
provides:
  - "Users CRUD (admin) + user self-update of own notification preferences"
  - "Thresholds read (any auth) + admin upsert with 60 s in-memory cache invalidation"
  - "GPS providers CRUD (admin) with apiKey masking on every response"
affects: [06-04, 06-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-sub-plugin RBAC split: readPlugin (authGuard) + writePlugin (requireRole) combined via .use()"
    - "Service projection helper drops passwordHash / masks apiKey before returning row"
    - "Process-local TTL cache with explicit invalidate() on write"

key-files:
  created:
    - "api/src/modules/users/users.service.ts"
    - "api/src/modules/users/users.plugin.ts"
    - "api/src/modules/thresholds/thresholds.service.ts"
    - "api/src/modules/thresholds/thresholds.plugin.ts"
    - "api/src/modules/gps-providers/gps-providers.service.ts"
    - "api/src/modules/gps-providers/gps-providers.plugin.ts"
  modified: []

key-decisions:
  - "RBAC split into two sub-plugins per module (read vs. write) — combining mid-chain would force admin scope on GET endpoints"
  - "writePlugin must chain .use(authGuard).use(requireRole(...)).group(...) — direct .patch off requireRole loses scoped `user` derive in TS inference (Elysia 1.4 scope propagation)"
  - "passwordHash never appears in any UserProjection; service drops it before returning every row"
  - "apiKey masked at projection layer (••••last4) — plaintext stays inside the API boundary (T-06.03-06 mitigation)"
  - "updateMyNotificationPreferences merges with existing prefs (partial update keeps untouched severities intact)"
  - "Hard delete is OK for gps_providers (D-20 stub, no FK chain); users are SOFT delete only (D-18)"

patterns-established:
  - "Module RBAC split pattern: two named sub-plugins (selfPlugin/readPlugin + adminPlugin/writePlugin), combined under one exported Elysia"
  - "Process-local cache: let cache + cacheExpiry + TTL_MS constant + explicit invalidate() called from write paths"
  - "Sensitive-field masking via dedicated projection helper (maskApiKey) applied uniformly across list/get/create/update return paths"

requirements-completed: [PHASE6-CONFIG-USERS-TAB, PHASE6-CONFIG-THRESHOLDS-TAB, PHASE6-CONFIG-GPS-PROVIDERS-TAB]

# Metrics
duration: 9min
completed: 2026-05-28
---

# Phase 6 Plan 03: Configurações Backend RBAC Summary

**Three Elysia plugins (users / thresholds / gps-providers) — admin-gated CRUD with bcrypt(10) password hashing, soft delete, process-local 60 s threshold cache, and apiKey masking — wired for Configurações tab consumption by Wave 2.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-28T20:25Z
- **Completed:** 2026-05-28T20:34Z
- **Tasks:** 2
- **Files created:** 6

## Accomplishments

- Users module: full admin CRUD + self-service notification-preferences endpoint reachable by any authenticated user. Soft delete via `isActive=false` per D-18 (FK chain preserved).
- Thresholds module: read-anyone / write-admin split with 60 s in-memory cache that auto-invalidates on every write (D-19 + T-06.03-07 mitigation).
- GPS providers module: admin CRUD with `apiKey` masked on every response (`••••last4`). Plaintext key never leaves the API boundary (T-06.03-06 partial mitigation pending Phase 7+ encryption-at-rest).
- All 6 files compile clean against `bun --bun tsc --noEmit` (exit 0).
- Zero impact on 06-02 scope: `api/src/modules/insights/*` and `api/src/modules/exports/*` not touched.

## Task Commits

Each task was committed atomically:

1. **Task 1: users module — service + plugin** — `30f0429` (feat)
2. **Task 2: thresholds + gps-providers — services + plugins** — `a7c2131` (feat)

## Files Created/Modified

- `api/src/modules/users/users.service.ts` — bcrypt(10) hash + 5 functions: `listUsers`, `getUserById`, `createUser`, `updateUser`, `deactivateUser`, `updateMyNotificationPreferences`. Projection helper drops passwordHash.
- `api/src/modules/users/users.plugin.ts` — 5 endpoints split across `selfPlugin` (authGuard) and `adminPlugin` (requireRole admin). PATCH `/api/users/me/notification-preferences` open to any role; full CRUD under `/api/users` admin-only. Soft delete via DELETE → 204.
- `api/src/modules/thresholds/thresholds.service.ts` — `getThresholds` (60 s cache), `updateThreshold` (upsert via `onConflictDoUpdate` + cache invalidate), `invalidateThresholdsCache`.
- `api/src/modules/thresholds/thresholds.plugin.ts` — `readPlugin` (GET, any auth) + `writePlugin` (PATCH, admin). writePlugin chains `.use(authGuard).use(requireRole('admin')).group('/api/thresholds', ...)` to keep `user.id` in handler scope.
- `api/src/modules/gps-providers/gps-providers.service.ts` — `maskApiKey` helper + projection used in every list/get/create/update return. Functions: `listGpsProviders`, `getGpsProvider`, `createGpsProvider`, `updateGpsProvider`, `deleteGpsProvider`.
- `api/src/modules/gps-providers/gps-providers.plugin.ts` — `readPlugin` (GET list + by-id, any auth) + `writePlugin` (POST/PATCH/DELETE, admin). Hard delete returns 204.

## Decisions Made

1. **Two-sub-plugin RBAC split per module** — rather than mid-chain `.use(requireRole)` on a single plugin, each module has a `read` plugin with authGuard and a `write` plugin with requireRole, composed together. Mid-chain requireRole would retroactively force admin on the preceding GET handlers (Elysia macros are scope-inclusive).
2. **writePlugin chains authGuard before requireRole even though requireRole already uses authGuard internally.** Without this prepend, the Elysia 1.4 TS inference does not propagate the `as: 'scoped'` derive from authGuard through `requireRole`'s wrapping plugin, causing `user.id` to be `undefined` in TS at the patch handler. Adding `.use(authGuard)` first surfaces the derive into the immediate chain scope without changing runtime semantics.
3. **`passwordHash` drop is enforced via a single `project()` helper** — every public function returns through the same projection, eliminating accidental `select *` leaks.
4. **`apiKey` masked at the service projection layer**, not the plugin. Means upstream callers (other backend modules in future phases) ALSO get masked values by default. An internal-only `getProviderWithSecrets` function would need to be added later for the real integration; not in scope for Phase 6 stub.
5. **`updateMyNotificationPreferences` merges with existing prefs** instead of replacing them. Sending `{critico: true}` leaves `medio` and `baixo` untouched. Matches user-expectation: per-severity toggles in the UI should be partial updates.
6. **Hard delete OK for `gps_providers`** (D-20 stub, no operational FK), versus soft delete for `users` (D-18, assigned alerts/treatments depend on the row).

## Deviations from Plan

### Rule 1 - Bug: TS inference of `user` lost through `requireRole` wrapper

- **Found during:** Task 2 (thresholds plugin)
- **Issue:** `bun --bun tsc --noEmit` failed with `TS2339: Property 'user' does not exist` inside the PATCH handler that chained `.use(requireRole('admin'))` directly followed by `.group(..., (app) => app.patch(..., ({user}) => ...))`. The plan's pseudocode assumed `user` would be in scope, but Elysia 1.4's TS lifting of `as: 'scoped'` derive does not cross the function-returned plugin boundary cleanly.
- **Fix:** Prepended `.use(authGuard)` before `.use(requireRole('admin'))` in `writePlugin`. authGuard's derive enters the immediate chain scope, satisfying TS while runtime behavior is unchanged (requireRole still re-runs authGuard internally — no double-auth performance cost, both share the same scoped derive instance).
- **Files modified:** `api/src/modules/thresholds/thresholds.plugin.ts` (Task 2 commit, no separate fix commit)
- **Verification:** `bun --bun tsc --noEmit` exit 0.
- **Committed in:** `a7c2131` (Task 2 commit)
- **Impact:** Pure typing fix. No behavior change. Plan instruction `Thresholds plugin pattern from RESEARCH.md` was replicated faithfully with this scope tweak.

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug, TS scope inference)
**Impact on plan:** Plan executed as written modulo the requireRole-scope tweak. Same pattern will be needed in 06-04 for any admin-write endpoints that consume `user.id` (push subscriptions, etc.).

## Issues Encountered

- Initial `tsc` run after Task 2 surfaced the `user` scope issue documented above. Resolved in a single edit.
- `api/src/modules/{exports,insights}/` directories existed untracked in the worktree (likely scaffolded by a parallel 06-02 agent or stale dir). Per scope boundary and `<destructive_git_prohibition>`, did NOT touch them — staged only the 6 files this plan owns. 06-02 owns the cleanup.

## Threat Model Compliance

All STRIDE register entries from PLAN frontmatter handled:

| Threat ID | Status | Mitigation in Code |
|-----------|--------|---------------------|
| T-06.03-01 (EoP /api/users/*) | mitigated | `requireRole('admin')` on adminPlugin; 403 via onBeforeHandle |
| T-06.03-02 (info disclosure passwordHash) | mitigated | `project()` helper drops the column from every return path |
| T-06.03-03 (admin self-promotion) | accepted | Out of scope (D-18 follow-up) — single-admin compromise risk documented |
| T-06.03-04 (tampering /me/notif-prefs) | mitigated | `user.id` derived from JWT in authGuard; body schema only allows critico/medio/baixo booleans |
| T-06.03-05 (hard delete own account) | accepted | Soft delete only — admin can deactivate self but reversible by DBA |
| T-06.03-06 (apiKey cleartext at rest) | partially mitigated | Masked in transit via `maskApiKey`; at-rest cleartext is documented Phase 6 stub limitation |
| T-06.03-07 (stale threshold cache) | mitigated | `invalidateThresholdsCache()` called inside `updateThreshold()` |
| T-06.03-08 (cache TTL DoS) | mitigated | `TTL_MS = 60_000` constant; `Date.now()` comparison |

## User Setup Required

None — no external service configuration required for this plan. Wiring into `api/src/index.ts` is delegated to plan 06-04.

## Next Phase Readiness

- **For 06-04 (Wave 1 wiring + push):** Plugins are exported as `usersPlugin`, `thresholdsPlugin`, `gpsProvidersPlugin`. Wire each via `app.use(...)` in `api/src/index.ts`. The alert engine's push dispatcher can import `getThresholds()` directly to read cached values without touching the DB on the hot path.
- **For 06-06 (Wave 2 Configurações frontend):** Endpoints follow standard `/api/users`, `/api/thresholds`, `/api/gps-providers` paths. Eden Treaty inference will pick them up automatically after wiring in 06-04.
- **Open follow-up:** Phase 7+ should encrypt `gps_providers.apiKey` at rest (T-06.03-06 partial mitigation only).

## Self-Check: PASSED

Files verified to exist:
- `api/src/modules/users/users.service.ts` FOUND
- `api/src/modules/users/users.plugin.ts` FOUND
- `api/src/modules/thresholds/thresholds.service.ts` FOUND
- `api/src/modules/thresholds/thresholds.plugin.ts` FOUND
- `api/src/modules/gps-providers/gps-providers.service.ts` FOUND
- `api/src/modules/gps-providers/gps-providers.plugin.ts` FOUND

Commits verified:
- `30f0429` FOUND (Task 1)
- `a7c2131` FOUND (Task 2)

Final `bun --bun tsc --noEmit`: exit 0.

---
*Phase: 06-insights-polish-deploy*
*Completed: 2026-05-28*
