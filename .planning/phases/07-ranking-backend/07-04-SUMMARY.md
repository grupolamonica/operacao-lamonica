---
phase: 07-ranking-backend
plan: 04
subsystem: api
tags: [elysia, eden-treaty, authGuard, supabase, ranking, bun, composition, swagger]

# Dependency graph
requires:
  - phase: 07-01
    provides: rankSupabase service_role client (ranking.supabase.ts) — now lazy-init
  - phase: 07-02
    provides: scoring pure layer (transformTrips/deriveDrivers) + ranking.types + getRouteBasePoints
  - phase: 07-03
    provides: I/O layer (ranking.reads 5 reads + ranking.sheets getSheetTrips CSV+Redis)
provides:
  - "ranking.service.ts — composeRanking (pure pipeline replicating ride-rank DataContext) + 5 service orchestrators (getRankingDrivers/Trips/Blocks/RouteScores/Stats)"
  - "ranking.plugin.ts — 5 GET /api/ranking/* behind authGuard, fixed response contract"
  - "rankingPlugin wired in index.ts before wsPlugin + swagger 'ranking' tag; ranking types reachable via export type App (Eden Treaty Phase 8)"
  - "ranking.supabase.ts converted to lazy-init (getRankSupabase + Proxy) — boot/test no longer require RANK_SUPABASE_SERVICE_KEY"
affects: [08-ranking-ui, 09-ranking-write]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composition service: a PURE composeRanking({...}) testable without I/O + thin async orchestrators (Promise.all of the reads/sheets) that call it — mirrors dashboard.service shape"
    - "Fixed HTTP contract for the Eden Treaty: /drivers returns the FULL RankedDriver[] (status + rank), UI filters by status (no server-side active-only list)"
    - "Lazy-init infra client via Proxy preserves the `rankSupabase.from(...)` call site while making module import side-effect-free (fail-fast moves from module-load to first query)"

key-files:
  created:
    - api/src/modules/ranking/ranking.service.ts
    - api/src/modules/ranking/ranking.service.test.ts
    - api/src/modules/ranking/ranking.plugin.ts
  modified:
    - api/src/index.ts
    - api/src/modules/ranking/ranking.supabase.ts

key-decisions:
  - "composeRanking replicates the ride-rank DataContext useMemo in EXACT order: transformTrips (FECHADA) → driverName enrich (dot-stripped id map) → optional dateRange filter → ajuste_manual clamp(0..100) → activelyBlockedIds (ativo && !manual_override) → deriveDrivers → status → rank-over-actives → activeDrivers"
  - "/drivers contract FIXED: full array (ATIVO + BLOQUEADO), pontuacao desc, rank 1..N over ATIVO only, blocked rank=null (RankedDriver = Driver & { rank: number|null })"
  - "/trips returns FECHADA only with ajuste_manual applied + optional from/to; NO SHOW NOT concatenated (parity decision; no-show stays separate for Phase 8/9)"
  - "vinculo kept at deriveDrivers default — Phase 7 ships no fetchVinculos read, matching the app before vinculos load (vinculoService is out of scope this phase)"
  - "/blocks returns raw active DriverBlockRecord[] (ativo===true), NOT the UI-derived deriveBlocks shape (that derivation is Phase 8 UI)"
  - "ranking.supabase.ts lazy-init (Rule 3 deviation) — module-load throw broke the pure composeRanking test (transitive import via reads) and the smoke-401 boot; fail-fast preserved at first real query"

patterns-established:
  - "Pure-core + async-orchestrator service split makes parity unit-testable without credentials"
  - "rankingPlugin inserted BEFORE wsPlugin — preserves the Elysia 1.4 'wsPlugin last' rule (T-07-12)"

requirements-completed: [PHASE7-ENDPOINTS-READ, PHASE7-EDEN-TYPES, PHASE7-SCORING-PARITY]

# Metrics
duration: ~30min
completed: 2026-05-30
---

# Phase 7 Plan 04: Ranking Composition Service + 5 Endpoints Summary

**Server-side ranking composition (`composeRanking`) that replicates the ride-rank `DataContext` pipeline end-to-end, exposed as 5 read-only `/api/ranking/*` GET endpoints behind the Torre `authGuard`, with the response contract fixed for the Phase 8 Eden Treaty.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-30T10:50Z (approx.)
- **Completed:** 2026-05-30T11:10Z
- **Tasks:** 3 of 4 (Task 4 is a human-verify checkpoint — PENDING credential, see below)
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- `composeRanking` (PURE) replicates the ride-rank `DataContext` useMemo in the EXACT order (transform → driverName enrich → dateRange → ajuste_manual clamp 0..100 → activelyBlockedIds → deriveDrivers → status → rank-over-actives → activeDrivers), returning `{ trips, drivers, activeDrivers, stats }`.
- 5 service orchestrators (`getRankingDrivers/Trips/Blocks/RouteScores/Stats`) that `Promise.all` the I/O layers (07-03) and compose.
- `ranking.plugin.ts`: 5 GET behind `authGuard` at `/api/ranking/{drivers,trips,blocks,route-scores,stats}`, each tagged `['ranking']`.
- `index.ts`: `rankingPlugin` registered BEFORE `wsPlugin` + swagger `ranking` tag; `export type App` intact → ranking types reach the Eden Treaty (Phase 8).
- 9 composition tests (ajuste_manual clamp, block/manual_override, rank-over-actives with no gaps, stats, name enrichment) — green alongside the 07-02 golden-sample (25 tests total).
- Smoke 401: API boots with an EMPTY `RANK_SUPABASE_SERVICE_KEY`; all 5 endpoints return `401 {"error":"Unauthorized: no session cookie"}` without a cookie; `/swagger/json` lists all 5 paths.

## Task Commits

Each task was committed atomically:

1. **Task 1: ranking.service.ts pipeline + composition tests** - `b4f93ab` (feat) — includes the lazy-init fix to `ranking.supabase.ts` (Rule 3, see Deviations).
2. **Task 2: ranking.plugin.ts — 5 GET behind authGuard** - `5c2d3bd` (feat)
3. **Task 3: wire rankingPlugin in index.ts + swagger tag** - `839b7eb` (feat)

**Plan metadata:** docs commit (SUMMARY + STATE + ROADMAP).

_Note: Task 1 is `tdd="true"`; the test file and implementation were authored together and verified green (RED was implicitly satisfied — the import-time throw failure surfaced and was fixed before the assertions passed). Both `bun test` (25 pass) and `bun --bun tsc --noEmit` (full project, exit 0) are green._

## Files Created/Modified
- `api/src/modules/ranking/ranking.service.ts` - **(created)** `composeRanking` pure pipeline (parity with ride-rank DataContext) + 5 async service orchestrators; exports `RankedDriver`, `DEFAULT_IGNORED_OCCURRENCES`, `composeRanking`.
- `api/src/modules/ranking/ranking.service.test.ts` - **(created)** 9 composition tests over `composeRanking` (no I/O).
- `api/src/modules/ranking/ranking.plugin.ts` - **(created)** `rankingPlugin` — 5 GET behind `authGuard` at `/api/ranking/*`.
- `api/src/index.ts` - **(modified)** import + `.use(rankingPlugin)` before `.use(wsPlugin)`; swagger `ranking` tag; `export type App` unchanged.
- `api/src/modules/ranking/ranking.supabase.ts` - **(modified)** lazy-init via `getRankSupabase()` + Proxy (see Deviations).

## Decisions Made
- **Full-array `/drivers` contract:** the endpoint returns ALL drivers (ATIVO + BLOQUEADO) ordered by `pontuacao` desc, each carrying `status` and `rank`. `rank` is the sequential 1..N position counting ONLY ATIVO drivers; BLOQUEADO drivers get `rank: null` and do not consume a number. The Phase 8 UI filters by `status`. This is the FIXED contract consumed by the Eden Treaty.
- **`/trips` = FECHADA only:** transformTrips already filters to FECHADA; `getRankingTrips` applies the optional from/to date filter and the ajuste_manual clamp, and does NOT concatenate `transformSheetNoShowTrips` (no-show stays separate, matching the plan and the DataContext split).
- **`vinculo` left at default:** the ride-rank DataContext enriches `vinculo` via `vinculoService`, but Phase 7 ships no `fetchVinculos` read (out of scope). `composeRanking` therefore keeps the `deriveDrivers` default `vinculo`, which matches the app before vinculos are loaded. No parity regression for `pontuacao`/`rank`/`status`.
- **`/blocks` raw shape:** returns active `DriverBlockRecord[]` (`ativo === true`), not the UI-only `deriveBlocks` derivation (Phase 8).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Converted `ranking.supabase.ts` from module-load fail-fast to lazy-init**
- **Found during:** Task 1 (running the `composeRanking` composition test)
- **Issue:** `ranking.service.ts` imports `ranking.reads.ts`, which imports `ranking.supabase.ts`. The 07-01 client threw `RANK_SUPABASE_URL is not defined` at MODULE LOAD, so `bun test ranking.service.test.ts` crashed before any assertion ran — even though `composeRanking` is pure and never touches the client. The same throw would block the smoke-401 boot when `RANK_SUPABASE_SERVICE_KEY` is empty.
- **Fix:** Moved the fail-fast into `getRankSupabase()` (created on first use) and exposed `rankSupabase` as a lazy `Proxy` that builds the client on first property access. The public surface (`rankSupabase.from(...)`, `type RankSupabase`) and the fail-fast message/severity are unchanged — only the MOMENT of validation moved (first real query, not import). The plan explicitly anticipated this option ("o módulo pode lazy-init o rankSupabase só para não quebrar o boot").
- **Files modified:** api/src/modules/ranking/ranking.supabase.ts
- **Verification:** `bun test src/modules/ranking/` → 25 pass (exit 0); API boots with empty `RANK_SUPABASE_SERVICE_KEY` and serves 401 on all 5 endpoints; `bun --bun tsc --noEmit` exit 0.
- **Committed in:** `b4f93ab` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The lazy-init is required for both the pure composition test and the smoke-401 boot to run without the secret. The 07-01 public API and security posture (service_role never logged, never VITE_, fail-fast preserved) are intact. No scope creep — `ranking.reads.ts` was not touched.

## Issues Encountered
- **Test/boot envs:** `ranking.sheets.ts` (07-03) imports `redis/client.ts`, which fail-fasts on missing `REDIS_URL` at module load. Since `composeRanking` is pure, the composition test is run with dummy infra envs (`REDIS_URL`, `RANK_SUPABASE_URL`, `RANK_SUPABASE_SERVICE_KEY`) — the same fake-env convention the plan endorses for the smoke. Redis is never actually used by the pure tests (the `[redis] error: ECONNREFUSED` line is the background `redis.on('error')` handler, not a test failure). `redis/client.ts` is shared infra and was left untouched (scope boundary).
  - **Repro command (verification):** `cd api && REDIS_URL="redis://127.0.0.1:6399" RANK_SUPABASE_URL="https://dummy.supabase.co" RANK_SUPABASE_SERVICE_KEY="dummy" bun test src/modules/ranking/`

## Pending Checkpoint — Task 4 (human-verify, real-data parity)

**Status: PENDING — blocked on user-setup secret `RANK_SUPABASE_SERVICE_KEY` (not available in this autonomous run).**

Task 4 is a `checkpoint:human-verify` (gate="blocking" for marking the PHASE verified, but NON-blocking for the build — the plan states the automated parity is already covered by the 07-02 golden-sample + this plan's composition tests + the smoke 401). It requires the ride-rank `service_role` key, which is a user-setup secret.

**What is already verified (no credential needed):**
- Golden-sample parity test (07-02) — green.
- Composition parity test (07-04, `composeRanking`) — green (9 tests).
- Smoke 401 on all 5 endpoints — confirmed (authGuard, T-07-09).
- `/swagger/json` lists `/api/ranking/{drivers,trips,blocks,route-scores,stats}`.

**To close Task 4 (after the key is configured):**
1. Set in `api/.env` (dev) and `/opt/apps/torre/.env` (VPS):
   - `RANK_SUPABASE_URL=https://vrlhfgfyjvkzfnafibnc.supabase.co` (known)
   - `RANK_SUPABASE_SERVICE_KEY=<service_role do ride-rank>` (Dashboard ride-rank → Settings → API → service_role; SERVER-SIDE ONLY, never VITE_/logs)
   - `RANK_SHEET_ID=1MWTiaXU3HXW_iVn-n70WSk3o8rcHTRrQP2ac07W9cCU`, `RANK_SHEET_TAB=DBLHHISTORICO` (public)
2. `cd api && bun run dev`, authenticate in the Torre, capture the `access_token` cookie.
3. `GET /api/ranking/drivers` (authenticated) → array ordered by `pontuacao` desc with `status` + `rank` (1..N over actives).
4. Compare `pontuacao`/`rank` for 1-2 drivers against the original ride-rank app over the same data window — must match.
5. `GET /api/ranking/stats` → activeDrivers/top3Avg/totalTrips/activeBlocks plausible.
6. Resume signal: type "aprovado" if parity matches, or report divergences (driver, expected vs returned).

## User Setup Required
**`RANK_SUPABASE_SERVICE_KEY` (service_role of the ride-rank Supabase) is required to SERVE real data and to close the Task 4 parity checkpoint.** It is a server-side secret (see the Pending Checkpoint section for the exact env block and how-to-verify). The build, types, tests and the 401 contract do NOT require it.

## Known Stubs
None — no hardcoded/placeholder data. All endpoints compose real ride-rank + Sheets data at request time; the only missing input is the user-setup `RANK_SUPABASE_SERVICE_KEY`, which gates SERVING (not the build/types/tests).

## Self-Check: PASSED

- FOUND: api/src/modules/ranking/ranking.service.ts
- FOUND: api/src/modules/ranking/ranking.service.test.ts
- FOUND: api/src/modules/ranking/ranking.plugin.ts
- FOUND: api/src/index.ts (rankingPlugin wired before wsPlugin; export type App intact)
- FOUND: api/src/modules/ranking/ranking.supabase.ts (lazy-init)
- FOUND commit b4f93ab (Task 1), 5c2d3bd (Task 2), 839b7eb (Task 3)
- VERIFIED: bun test src/modules/ranking/ → 25 pass, exit 0
- VERIFIED: bun --bun tsc --noEmit → exit 0 (full project)
- VERIFIED: smoke 401 on all 5 endpoints + swagger lists 5 paths

## Next Phase Readiness
- Phase 8 (ranking UI) can consume `/api/ranking/*` via the Eden Treaty (`App`): the `RankedDriver[]` contract (`status` + `rank`) and the FECHADA-only `Trip[]` are fixed.
- Phase 9 (writes: evaluations/blocks/route-scores) builds on the same module; the read service is the parity baseline.
- **Blocker (not this plan):** the real-data parity checkpoint (Task 4) stays open until `RANK_SUPABASE_SERVICE_KEY` is set and a sample is compared against the original app.

---
*Phase: 07-ranking-backend*
*Completed: 2026-05-30*
