# Deferred Items — Phase 7 Ranking Backend

## From Plan 07-01 (Wave 1) — out-of-scope, owned by 07-02

- **[07-02 owns] `bun tsc` full-project fails on `ranking.scoring.test.ts`**
  - **Discovered during:** 07-01 final verification.
  - **Errors:** `TS2307 Cannot find module './ranking.routes'` (exports), `TS2307 Cannot find module './ranking.scoring'`, `TS6133 'i' declared but never read` in `src/modules/ranking/ranking.scoring.test.ts`.
  - **Cause:** Plan 07-02 is mid-TDD-RED (commit `c538b54 test(07-02): paridade scoring ranking + golden-sample (RED)`). Its test file imports `./ranking.scoring` and route exports that 07-02 has not yet implemented (GREEN phase pending).
  - **Why not fixed by 07-01:** `ranking.scoring.test.ts` / `ranking.scoring.ts` / `ranking.routes.ts` are explicitly owned by 07-02 (07-01 boundary: "NÃO toca ranking.types.ts, ranking.routes.ts, ranking.scoring.ts"). The error is expected RED-phase behavior for 07-02.
  - **07-01 scoped verification:** Project tsc EXCLUDING `ranking.scoring.test.ts` -> exit 0. `ranking.supabase.ts` has no dependency on any 07-02 file. 07-01's own behavioral tests (fail-fast THREW, client INIT_OK) pass.
  - **Resolution:** 07-02 GREEN phase (implement `ranking.scoring.ts` + `ranking.routes.ts`) makes the full-project tsc pass. No action needed from 07-01.
