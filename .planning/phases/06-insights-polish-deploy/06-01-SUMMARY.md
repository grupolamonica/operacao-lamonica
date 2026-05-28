---
phase: 06-insights-polish-deploy
plan: 01
subsystem: infra
tags: [drizzle, postgres, sentry, web-push, vapid, shadcn, react-hook-form, zod, bun, scaffold]

# Dependency graph
requires:
  - phase: 02-backend-core-auth-api-foundation
    provides: users table + Drizzle schema convention + .env.example + pino logger
  - phase: 04
    provides: alerts module that will consume thresholds + alert engine
  - phase: 05
    provides: PostGIS schemas + geofences (pattern for new tables)
provides:
  - Drizzle schemas push_subscriptions / alert_thresholds / gps_providers exported from barrel
  - users.notification_preferences JSONB column with default {critico:true, medio:false, baixo:false}
  - api/src/lib/scrub.ts + torre-de-controle/src/lib/scrub.ts recursive PII scrubber (17 keys, depth 8)
  - api/src/lib/sentry.ts side-effect init @sentry/node + beforeSend scrub (no wiring yet — defer to 06-04/06-07)
  - api/src/lib/vapid.ts env loader + webpush.setVapidDetails configured at module load
  - torre-de-controle/src/lib/sentry.ts initSentry() called from main.tsx before createRoot
  - torre-de-controle/src/components/ui/form.tsx (shadcn Form/FormField/FormItem/FormLabel/FormControl/FormMessage/FormDescription)
  - Backend deps web-push@3.6.7 + @sentry/node@10.55.0 + @types/web-push@3.6.4
  - Frontend deps @sentry/react@10.55.0 + react-hook-form@7.76.1 + zod@4.4.3 + @hookform/resolvers@5.4.0 + @sentry/vite-plugin@5.3.0
  - api/.env.example documents VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT / SENTRY_DSN / SENTRY_ENVIRONMENT
  - torre-de-controle/.env.example (new file) documents VITE_API_URL / VITE_SENTRY_DSN / VITE_VAPID_PUBLIC_KEY
  - Seed defaults: atraso_critico_minutes=30, desvio_km_threshold=2, stop_duration_minutes=15 (idempotent)
affects: [06-02-insights, 06-03-exports, 06-04-push, 06-05-config, 06-06-frontend-polish, 06-07-deploy, 06-08-deploy-runbook, phase-7+]

# Tech tracking
tech-stack:
  added:
    - "web-push@3.6.7 (VAPID + push send) — backend"
    - "@sentry/node@10.55.0 (error tracking) — backend"
    - "@types/web-push@3.6.4 — devDep backend"
    - "@sentry/react@10.55.0 (React error boundary + capture) — frontend"
    - "@sentry/vite-plugin@5.3.0 (source maps upload) — frontend devDep"
    - "react-hook-form@7.76.1 (uncontrolled inputs + perf) — frontend"
    - "zod@4.4.3 (schema validation paired with RHF) — frontend"
    - "@hookform/resolvers@5.4.0 (zodResolver adapter) — frontend"
    - "shadcn form.tsx (Form / FormField / FormItem wrappers over RHF)"
  patterns:
    - "Side-effect module init pattern (logger.ts analog) reused for sentry.ts + vapid.ts — no exports, just env-conditioned setVapidDetails / Sentry.init"
    - "Recursive PII scrubber shared between backend + frontend with identical SCRUB_KEYS array (17 keys, MAX_DEPTH=8, Bearer-token regex on string values)"
    - "Drizzle barrel ordering: new schemas exported BEFORE relations.ts (relations resolves last after tables exist)"
    - "Notification preferences as JSONB (vs columns) — D-14 Claude's discretion locked"
    - "Per-user FK CASCADE on push_subscriptions.user_id — cleanup on hard-delete"
    - "Seed inserts with onConflictDoNothing for idempotency on thresholds re-seed"

key-files:
  created:
    - "api/src/db/schema/push-subscriptions.ts — pushSubscriptions table (id PK, user_id FK CASCADE, endpoint UNIQUE, p256dh, auth, created_at, idx on user_id)"
    - "api/src/db/schema/alert-thresholds.ts — alertThresholds table (type VARCHAR(50) PK, value INT, updated_by FK, updated_at)"
    - "api/src/db/schema/gps-providers.ts — gpsProviders table (id defaultRandom, name, base_url, api_key, is_active, created_at)"
    - "api/src/lib/scrub.ts — backend scrubRecursive + SCRUB_KEYS"
    - "api/src/lib/sentry.ts — @sentry/node side-effect init (scaffold only)"
    - "api/src/lib/vapid.ts — VAPID env loader + isVapidConfigured + vapidPublicKey exports"
    - "torre-de-controle/src/lib/scrub.ts — frontend scrubRecursive (no Node imports)"
    - "torre-de-controle/src/lib/sentry.ts — initSentry() called from main.tsx"
    - "torre-de-controle/src/components/ui/form.tsx — shadcn Form wrappers over RHF"
    - "torre-de-controle/.env.example — new file documenting VITE_API_URL / VITE_SENTRY_DSN / VITE_VAPID_PUBLIC_KEY"
  modified:
    - "api/src/db/schema/users.ts — added jsonb import + notificationPreferences column with default object"
    - "api/src/db/schema/relations.ts — usersRelations adds pushSubscriptions:many + new pushSubscriptionsRelations export"
    - "api/src/db/schema/index.ts — barrel re-exports 3 new schemas BEFORE ./relations"
    - "api/src/db/seed/index.ts — inserts 3 alert_thresholds defaults with onConflictDoNothing"
    - "api/.env.example — appended VAPID + SENTRY_DSN/ENVIRONMENT vars"
    - "api/package.json — pinned web-push@3.6.7 + @sentry/node@10.55.0 + @types/web-push@3.6.4"
    - "api/bun.lock — Bun lockfile reflecting new resolutions"
    - "torre-de-controle/package.json — pinned @sentry/react / react-hook-form / zod / @hookform/resolvers / @sentry/vite-plugin (no caret)"
    - "torre-de-controle/bun.lock — lockfile reflecting new resolutions"
    - "torre-de-controle/.gitignore — added `!.env.example` exception so example file can be committed (Rule 2 fix)"
    - "torre-de-controle/src/main.tsx — import + call initSentry() BEFORE createRoot()"

key-decisions:
  - "Used local Bun runtime (1.3.13 on PATH) instead of Docker fallback — plan instructions assumed Bun was not installed, but `where bun` returned a working binary"
  - "Skipped runtime VAPID key generation script — vapid.ts only loads env vars; key generation is a one-time manual op documented in api/.env.example comment (`bunx web-push generate-vapid-keys --json`). Deferred per CONTEXT D-44 (secrets in env stores only)"
  - "Sentry NOT wired into api/src/index.ts — file is scaffold-only per plan; actual side-effect import is reserved for plan 06-04 (push module) and 06-07 (deploy hardening)"
  - "Pinned exact versions in package.json (no caret prefix) for all Phase 6 deps to match plan acceptance criteria + Standard Stack table"
  - "Added idx_push_subscriptions_user_id index — push dispatcher will query by user_id frequently when fanning out alerts to all subscriptions of a user"
  - "Notification preferences kept nullable in users — legacy rows pre-Phase-6 may have NULL; backend will fall back to default object when reading (defense against drizzle-kit push not backfilling defaults — RESEARCH.md Risk A10)"

patterns-established:
  - "Pattern: Side-effect lib module — sentry.ts + vapid.ts boot at import; gated on env var truthiness; no exports needed (except read-only flags like isVapidConfigured)"
  - "Pattern: Shared scrub module — identical SCRUB_KEYS + scrubRecursive copied verbatim between api/ and torre-de-controle/ (no shared package; manual sync acceptable for 1 file)"
  - "Pattern: Drizzle barrel + relations ordering — new tables exported before relations.ts so the relations() callbacks can reference them"
  - "Pattern: shadcn form via `bunx shadcn add form` with N to overwrite — preserves existing button.tsx / label.tsx, creates only form.tsx"

requirements-completed:
  - PHASE6-WEB-PUSH-VAPID
  - PHASE6-SENTRY-BACKEND
  - PHASE6-SENTRY-FRONTEND

# Metrics
duration: ~18 min
completed: 2026-05-28
---

# Phase 6 Plan 01: Wave 0 Scaffold Summary

**Wave-0 infra scaffold: 3 new Drizzle tables (push_subscriptions, alert_thresholds, gps_providers) + users.notification_preferences JSONB + Sentry/VAPID/scrub libs + locked versions for web-push, @sentry/{node,react}, react-hook-form, zod, shadcn form — Wave 1 and Wave 2 can now run in parallel.**

## Performance

- **Duration:** ~18 minutes
- **Started:** 2026-05-28
- **Completed:** 2026-05-28
- **Tasks:** 2/2
- **Files modified/created:** 21 (3 schemas new, 3 schemas modified, 6 libs new, 2 env files, 4 package/lockfile, 3 ancillary)

## Accomplishments

- 3 new Drizzle schemas exported from `api/src/db/schema/index.ts` (push_subscriptions, alert_thresholds, gps_providers) — runtime import verified
- `users.notification_preferences` JSONB column with literal default `{ critico: true, medio: false, baixo: false }`
- `pushSubscriptionsRelations` + `usersRelations.pushSubscriptions` wired in `relations.ts`
- Seed inserts 3 threshold defaults (30 / 2 / 15) idempotently via `onConflictDoNothing()`
- Recursive PII scrubber (17 keys, depth 8, Bearer regex) shared between backend + frontend
- `api/src/lib/sentry.ts` (scaffold) — boots `@sentry/node` only when `SENTRY_DSN` set
- `api/src/lib/vapid.ts` — calls `webpush.setVapidDetails()` at module load + exports `isVapidConfigured`
- `torre-de-controle/src/main.tsx` calls `initSentry()` before `createRoot()`
- shadcn `form.tsx` installed with `Form / FormField / FormItem / FormLabel / FormControl / FormMessage / FormDescription` exports
- Backend + frontend `tsc --noEmit` clean (exit 0)
- Frontend `vite build` succeeds (442.96 kB gzip — bundle warning expected, addressed in 06-06)

## Task Commits

1. **Task 1: Install deps + scaffold scrub/sentry/vapid libs** — `8e77a06` (feat)
2. **Task 2: Drizzle schemas + users notif prefs + barrel/relations + seed defaults** — `de732d0` (feat)

## Files Created

- `api/src/db/schema/push-subscriptions.ts` — `pushSubscriptions` Drizzle table with FK CASCADE + UNIQUE endpoint + index on user_id
- `api/src/db/schema/alert-thresholds.ts` — `alertThresholds` Drizzle table (key-value style, type=PK)
- `api/src/db/schema/gps-providers.ts` — `gpsProviders` Drizzle table (nullable baseUrl/apiKey, isActive default true)
- `api/src/lib/scrub.ts` — `scrubRecursive` + `SCRUB_KEYS` exports
- `api/src/lib/sentry.ts` — side-effect init of `@sentry/node` gated on `process.env.SENTRY_DSN`
- `api/src/lib/vapid.ts` — env loader; exports `isVapidConfigured` + `vapidPublicKey`
- `torre-de-controle/src/lib/scrub.ts` — frontend mirror of backend scrubber (identical SCRUB_KEYS)
- `torre-de-controle/src/lib/sentry.ts` — `initSentry()` gated on `import.meta.env.VITE_SENTRY_DSN`
- `torre-de-controle/src/components/ui/form.tsx` — shadcn Form wrappers over `react-hook-form` (RSC=false, TSX)
- `torre-de-controle/.env.example` — new file (was missing); documents VITE_API_URL / VITE_SENTRY_DSN / VITE_VAPID_PUBLIC_KEY + commented CI source-map vars

## Files Modified

- `api/src/db/schema/users.ts` — added `jsonb` import + `notificationPreferences` JSONB column with literal default
- `api/src/db/schema/relations.ts` — added `pushSubscriptions` import; extended `usersRelations`; new `pushSubscriptionsRelations`
- `api/src/db/schema/index.ts` — re-exports `./push-subscriptions`, `./alert-thresholds`, `./gps-providers` before `./relations`
- `api/src/db/seed/index.ts` — imports `alertThresholds` from schema; inserts 3 defaults idempotently
- `api/.env.example` — appended `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `SENTRY_DSN` / `SENTRY_ENVIRONMENT`
- `api/package.json` — pinned `web-push@3.6.7` + `@sentry/node@10.55.0` + `@types/web-push@3.6.4`
- `api/bun.lock` — Bun lockfile refreshed
- `torre-de-controle/package.json` — pinned `@sentry/react@10.55.0` + `react-hook-form@7.76.1` + `zod@4.4.3` + `@hookform/resolvers@5.4.0` + `@sentry/vite-plugin@5.3.0`
- `torre-de-controle/bun.lock` — Bun lockfile refreshed
- `torre-de-controle/.gitignore` — added `!.env.example` exception so the example file can be tracked
- `torre-de-controle/src/main.tsx` — imported `initSentry` from `./lib/sentry`; called BEFORE `createRoot()`

## Decisions Made

- **Local Bun (1.3.13) used directly** — `where bun` returned a working binary on PATH, so the Docker fallback path described in the prompt was unnecessary. All `bun add` commands ran from the host shell against `api/` and `torre-de-controle/`.
- **VAPID key generation deferred to manual setup** — `vapid.ts` only consumes env. No generator script was created (one-line `bunx web-push generate-vapid-keys --json` documented in `api/.env.example` comment). This matches CONTEXT D-44 (secrets ship blank in `.env.example`, real values live in Railway/CF Pages env stores).
- **Sentry not yet wired in `api/src/index.ts`** — plan explicitly says "Sentry init wiring fica em 06-04 + 06-07". Wave 0 only creates the libs; runtime activation comes later. The CONFIG-ONLY (no behavior change) keeps Wave-0 small and reversible.
- **Exact-pinned versions in `package.json`** (no caret) — plan acceptance criterion: "All listed deps present in respective package.json with exact versions from RESEARCH.md Standard Stack table." Manually rewrote `^x.y.z` → `x.y.z` for the 5 new deps Bun added with caret.
- **`idx_push_subscriptions_user_id` index added** — Claude's discretion (CONTEXT D-13). Push dispatcher will frequently `SELECT … FROM push_subscriptions WHERE user_id = $1` when an alert triggers; index keeps this hot path cheap.
- **`notificationPreferences` nullable** — legacy rows pre-Phase-6 have no value; drizzle-kit push may not backfill defaults. Backend will need to fall back to default when reading (defense in depth — RESEARCH.md Risk A10).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical] `torre-de-controle/.gitignore` excluded `.env.example`**
- **Found during:** Task 1 (after creating `torre-de-controle/.env.example`)
- **Issue:** The frontend `.gitignore` had a broad `.env*` glob that also blocked `.env.example` from ever being committed. Without `.env.example` tracked, the plan's explicit `must_haves.truths` for documented frontend envs (VITE_API_URL, VITE_SENTRY_DSN, VITE_VAPID_PUBLIC_KEY) would be lost; other devs would have no template.
- **Fix:** Added `!.env.example` exception line in `torre-de-controle/.gitignore` immediately after the `.env*` block.
- **Files modified:** `torre-de-controle/.gitignore`
- **Verification:** `git check-ignore -v torre-de-controle/.env.example` now reports the negation match; `git status` lists the file as untracked-but-not-ignored.
- **Committed in:** `8e77a06` (Task 1 commit)

**2. [Rule 2 — Missing Critical] Pin exact versions (remove caret) for new deps**
- **Found during:** Task 1 verification
- **Issue:** Bun's `bun add` default behavior prepends `^` to dependency ranges. Plan acceptance criterion required "exact versions from RESEARCH.md Standard Stack table" — caret allows future minor bumps that would drift from the locked stack.
- **Fix:** Manually rewrote `"react-hook-form": "^7.76.1"` → `"7.76.1"` (and the other 4 affected deps).
- **Files modified:** `torre-de-controle/package.json`, `api/package.json`
- **Verification:** `bun pm ls --depth=0` shows exact versions resolved; lockfile already pinned to specific commits.
- **Committed in:** `8e77a06` (Task 1 commit)

**3. [Rule 3 — Blocking] Bun is installed locally (plan said it was not)**
- **Found during:** Task 1, Step A (before first `bun add` call)
- **Issue:** Prompt context stated "Bun NOT installed locally — use Docker fallback". Verification via `where bun` returned `C:\Users\antonio.magalhaes\.bun\bin\bun.exe` (v1.3.13). Forcing Docker fallback would have been a slower, more error-prone code path with mounted-volume permission concerns on Windows.
- **Fix:** Used local Bun directly for `bun add` calls; documented the discrepancy here for the next executor.
- **Files modified:** None (operational decision only).
- **Verification:** `bun add` ran cleanly twice (backend + frontend); lockfiles updated as expected.
- **Committed in:** Implicit across `8e77a06` and `de732d0`.

---

**Total deviations:** 3 auto-fixed (2 missing-critical config, 1 blocking-discovery)
**Impact on plan:** All three deviations are operational / config-level — no behavior change. Pin-versions deviation matches plan acceptance criteria more strictly. The gitignore fix is a prerequisite for the plan's `must_haves` to be true after commit.

## Issues Encountered

- **shadcn `add form` is interactive on Windows** — first `bunx shadcn@latest add form -y` invocation still prompted for `button.tsx` overwrite. Worked around by piping `echo "N"` so the overwrite prompt resolves to "no" (preserves the existing customized `button.tsx`). Form.tsx was created without overwriting button/label.
- **CRLF warnings during `git add`** — expected on Windows. Git's autocrlf normalizes on add; no behavioral impact on the committed content.
- **Bundle size warning on `vite build`** (1.5 MB unzipped, 442 KB gzip) — not in scope for Wave 0; manualChunks + lazy-loaded routes are addressed in plan 06-06 (frontend polish + code-splitting).

## User Setup Required

None for Wave 0. Real VAPID + SENTRY_DSN values must be provisioned later:

- **Backend** (`api/.env`, populated by Railway env store in prod):
  ```
  VAPID_PUBLIC_KEY=<generate via: bunx web-push generate-vapid-keys --json>
  VAPID_PRIVATE_KEY=<from same command>
  VAPID_SUBJECT=mailto:admin@torredecontrole.com
  SENTRY_DSN=<from Sentry project settings>
  ```
- **Frontend** (`torre-de-controle/.env.local`, populated by Cloudflare Pages env store in prod):
  ```
  VITE_VAPID_PUBLIC_KEY=<same public key as backend>
  VITE_SENTRY_DSN=<from Sentry React project settings>
  ```

These setups are coordinated by plan 06-07 (deploy) and plan 06-08 (deploy runbook).

## Threat Flags

None — no new security-relevant surface beyond what the Phase 6 `<threat_model>` already enumerates (T-06.01-01..06 all addressed by scrub.ts + UNIQUE constraints + .env separation).

## Next Phase Readiness

- **Wave 1 (backend modules — plans 06-02..06-05) is UNBLOCKED:**
  - `pushSubscriptions` / `alertThresholds` / `gpsProviders` schemas are import-resolvable.
  - `users.notificationPreferences` is available for push opt-in/severity filtering.
  - `api/src/lib/vapid.ts` ready to be imported by `push.dispatcher.ts`.
  - `api/src/lib/sentry.ts` ready to be `import`-ed for side-effect activation in 06-04.
  - `web-push` + `@sentry/node` runtime deps installed.
- **Wave 2 (frontend pages — plan 06-06) is UNBLOCKED:**
  - `@sentry/react` initialized at app boot; future ErrorBoundary wrapping uses it.
  - `react-hook-form` + `zod` + `@hookform/resolvers` + shadcn `Form` available for Configurações forms.
  - `torre-de-controle/src/lib/scrub.ts` ready to scrub future Sentry contexts.
- **No drizzle-kit push executed** against `DATABASE_URL`. Schema is committed to repo only; physical DB application happens in plan 06-08 against the production Railway DB with `--strict --verbose`.

## Self-Check: PASSED

Verified:
- `api/src/db/schema/push-subscriptions.ts` FOUND
- `api/src/db/schema/alert-thresholds.ts` FOUND
- `api/src/db/schema/gps-providers.ts` FOUND
- `api/src/lib/scrub.ts` / `sentry.ts` / `vapid.ts` FOUND
- `torre-de-controle/src/lib/scrub.ts` / `sentry.ts` FOUND
- `torre-de-controle/src/components/ui/form.tsx` FOUND
- `torre-de-controle/.env.example` FOUND
- Commits `8e77a06` and `de732d0` FOUND in `git log --all`
- `bun --bun tsc --noEmit` exit 0 (backend)
- `npx tsc -b --noEmit` exit 0 (frontend)
- `npm run build` (frontend) — exit 0, dist generated
- Runtime barrel import: `pushSubscriptions / alertThresholds / gpsProviders / usersRelations` all truthy

---
*Phase: 06-insights-polish-deploy*
*Completed: 2026-05-28*
