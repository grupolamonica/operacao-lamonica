---
phase: 09-ranking-escrita-auditoria-write-flows
plan: "03"
subsystem: ranking-writes
tags: [ranking, writes, rbac, audit, auto-block, no-show, elysia-plugin]
dependency_graph:
  requires: ["09-01"]
  provides: ["POST /api/ranking/evaluations", "POST /api/ranking/blocks", "PATCH /api/ranking/blocks/:id"]
  affects: ["09-04", "09-05", "front-end write hooks"]
tech_stack:
  added: []
  patterns:
    - "authGuard inline + onBeforeHandle role check (≡ requireRole — Elysia 1.4.28 scoped-derive workaround)"
    - "sequential fail-fast audit in same handler (T4 — not try/catch like ride-rank)"
    - "operador server-resolved from Torre users table (JWT carries no name)"
key_files:
  created:
    - api/src/modules/ranking/ranking.write.service.ts
    - api/src/modules/ranking/ranking.write.plugin.ts
  modified:
    - api/src/index.ts
    - api/.env.example
decisions:
  - "Plugin pattern used (not inline in index.ts) — users.plugin POST-with-body works in plugin"
  - "authGuard inline + onBeforeHandle replaces requireRole() to fix Elysia scoped-derive TS bug"
  - "Torre propagates block/audit errors (diverges from ride-rank try/catch) — operator sees failure"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-30"
  tasks_completed: 2
  tasks_total: 3
  files_count: 4
---

# Phase 9 Plan 03: Ranking Write Service + Plugin Summary

**One-liner:** POST /evaluations (upsert+CRIAÇÃO/EDIÇÃO+NO_SHOW auto-block), POST /blocks (MANUAL+BLOQUEIO_MANUAL), PATCH /blocks/:id (DESBLOQUEIO) — all behind authGuard+role check, operador server-resolved from Torre users, audit fail-fast, cache busted after each write.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ranking.write.service.ts | 8bfc6b5 | api/src/modules/ranking/ranking.write.service.ts |
| 2 | ranking.write.plugin.ts + index.ts wire | a9e4dcd | ranking.write.plugin.ts, api/src/index.ts, api/.env.example |

## Task 3: Deferred to Checkpoint

Task 3 (`checkpoint:human-verify`) requires `RANK_SUPABASE_SERVICE_KEY` (the anon key of Lamonica Ranking) to verify DB effect. Not auto-approving — stopped here per plan spec (`autonomous: false`).

## What Was Built

### Task 1 — `ranking.write.service.ts`

Pure async orchestrators (no Elysia dependency), composing 09-01 data-layer helpers:

- **`resolveOperador(userId)`** — `db.select({ name, email }).from(users).where(eq(users.id, userId)).limit(1)`; returns `name || email || userId`. Never trusts client-supplied operador (T-09-12).
- **`evaluateTrip(input, userId)`** — upsert + CRIAÇÃO/EDIÇÃO log with `existed` flag and `before→dados_antes` wired; conditional NO_SHOW auto-block (`atendeu=false` → insertDriverBlock tipo=NO_SHOW + BLOQUEIO_NO_SHOW log); bustRankingCache. Returns `{ blocked }`.
- **`blockDriverManual(input, userId)`** — MANUAL block (ativo=true, manual_override=false) + BLOQUEIO_MANUAL log + bust.
- **`unblockDriver(input, userId)`** — unblockDriverBlocks + MANUAL override record (manual_override=true, ativo=false) + DESBLOQUEIO log + bust.

Accented audit literals: `'CRIAÇÃO'` / `'EDIÇÃO'` (byte-for-byte ride-rank parity, no ASCII fallback — verified with grep, count=0 for CRIACAO/EDICAO).

### Task 2 — `ranking.write.plugin.ts` + wiring

**Body-bug path taken: PLUGIN** (D-09-08 decision). The `users.plugin` POST-with-body-in-plugin pattern works. The Elysia body itself parses fine; the issue was TypeScript's `as:'scoped'` derive not crossing plugin boundaries when consumed via `requireRole()` (3rd-party plugin wrapper). Fix: `.use(authGuard)` directly on the plugin + `onBeforeHandle` role check — security-identical to `requireRole('admin','supervisor')`.

Typebox validation (T5, D-09-06):
- `comunicacaoSchema`: `t.Union([t.Literal('BOA'), t.Literal('REGULAR'), t.Literal('RUIM')])`
- `desvioSchema`: `t.Union([t.Literal('NENHUM'), t.Literal('LEVE'), t.Literal('GRAVE')])`
- `posturaSchema`: `t.Union([t.Literal('OK'), t.Literal('RUIM')])`
- `ajuste_manual`: `t.Integer({ minimum: -20, maximum: 20 })` — out-of-range → 422 via global onError VALIDATION

`index.ts` wiring: `rankingWritePlugin` wired at L176 — after `rankingPlugin` (L173), before `wsPlugin` (L177).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Elysia scoped-derive TS error: `user` not in handler type**
- **Found during:** Task 2
- **Issue:** `.use(requireRole('admin','supervisor'))` injects `user` via `derive({ as: 'scoped' })`. When the derive is in a 3rd-party plugin (requireRole returns a new Elysia instance), TypeScript's type inference doesn't propagate `user` to the consuming plugin's handler signatures. Error: `Property 'user' does not exist on type`.
- **Fix:** Replaced `.use(requireRole(...))` with `.use(authGuard)` (direct) + `.onBeforeHandle(({ user, set }) => { if (!['admin','supervisor'].includes(user.role)) ... })`. This is byte-for-byte what `requireRole` does internally (rbac.ts L34-43). Security is identical — authGuard validates JWT + Redis blacklist; onBeforeHandle enforces the role.
- **Files modified:** api/src/modules/ranking/ranking.write.plugin.ts
- **Commit:** a9e4dcd

**Note for 09-04:** The plugin pattern works — `group()` is NOT used (routes registered with full `/api/ranking/...` paths to preserve derive scope). If 09-04 needs more write routes, use the same pattern.

### Deliberate Divergence from ride-rank

ride-rank's `evaluateTrip` swallows block errors with `try/catch` (console.error). Torre propagates — the operator sees the failure rather than a silently missing block row. This is intentional server-side behavior (D-09-05, T4 audit integrity). Documented in `ranking.write.service.ts` header.

## Structural Verification (Autonomous — no secret needed)

```
bun --bun tsc --noEmit    → exit 0 ✓
grep resolveOperador       → L57 (function) + L102,188,243 (calls) ✓
grep -c createEvaluationLog → 5 (≥4: CRIAÇÃO/EDIÇÃO + BLOQUEIO_NO_SHOW + BLOQUEIO_MANUAL + DESBLOQUEIO) ✓
grep BLOQUEIO_NO_SHOW      → L151 in !atendeu branch ✓
grep "No-Show na viagem"   → L139 in !atendeu branch ✓
grep -c bustRankingCache   → 4 (≥3) ✓
grep "manual_override: true" → L256 in unblockDriver override insert ✓
grep "existed, before"     → L118 (destructure from upsertEvaluation) ✓
grep "existed ?"           → L126 (acao ternary) ✓
grep "'CRIAÇÃO'"           → L126 ✓
grep "'EDIÇÃO'"            → L126 ✓
grep -c "CRIACAO\|EDICAO"  → 0 (no ASCII fallbacks) ✓
grep "dados_antes: before" → present in evaluateTrip log call ✓
grep requireRole/role check → L62 onBeforeHandle with 'admin','supervisor' ✓
grep rankingWrite in index  → L35 (import) + L176 (.use) ✓
grep "t.Integer"           → L90 with minimum:-20, maximum:20 ✓
grep -c "t.Union"          → 3 ✓
wsPlugin order             → L173 rankingPlugin → L176 rankingWritePlugin → L177 wsPlugin ✓
```

## Checkpoint Pending (Task 3)

**Type:** `checkpoint:human-verify` (blocking)
**Requires:** `RANK_SUPABASE_SERVICE_KEY` (anon key of Lamonica Ranking — Dashboard → Settings → API → anon/public)
**Awaits:** live DB-effect verification (evaluations row + logs row; NO_SHOW block; BLOQUEIO_MANUAL + DESBLOQUEIO; operador = Torre user name; cache bust confirmed by immediate read reflection)

See 09-03-PLAN.md Task 3 for exact verification steps.

## Threat Surface Scan

No new surface beyond what the plan's threat_model covers. The 3 write endpoints are covered by T-09-03 (RBAC), T-09-05 (input validation), T-09-04 (audit), T-09-12 (operador spoofing), T-09-02 (key exposure), T-09-13 (DoS/maxLength), T-09-14 (RLS open — accepted).

## Known Stubs

None — the service is fully wired. DB-effect verification is deferred to the Task 3 checkpoint, not a stub.

## Self-Check

Files exist:
- api/src/modules/ranking/ranking.write.service.ts ✓
- api/src/modules/ranking/ranking.write.plugin.ts ✓

Commits exist:
- 8bfc6b5 feat(09-03): ranking.write.service ✓
- a9e4dcd feat(09-03): ranking.write.plugin ✓

## Self-Check: PASSED
