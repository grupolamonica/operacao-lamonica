# Phase 6 — Deferred Items

Items discovered during execution but OUT OF SCOPE of the current plan. Logged here for downstream resolution.

---

## 06-05 Wave 3 — Insights Page

### Discovered during execution

**1. TS errors in `torre-de-controle/src/app/pages/configuracoes/tabs/AlertThresholdsTab.tsx`**

- **Status:** Untracked in current worktree (created by parallel Wave 3 plan — likely 06-06 or 06-07)
- **Errors:**
  - `TS2322` — `Resolver<{...; unknown }>` not assignable to `Resolver<{...; number }>`
  - `TS2345` — `SubmitHandler<TFieldValues>` mismatch (line 97)
  - `TS2322` × 3 — `Control<...,TFieldValues>` mismatch (lines 99, 108, 117)
- **Root cause hypothesis:** react-hook-form v7 generic inference issue when zodResolver `output` type widens to `unknown` (likely missing explicit generic on `useForm<T>`)
- **Why deferred:** File NOT owned by 06-05. Plan boundary is `torre-de-controle/src/app/pages/insights/*` + `torre-de-controle/src/hooks/useInsights.ts`. Touching configuracoes/tabs would violate plan scope contract.
- **Owner:** Plan that created the file (06-06 or 06-07 — to be confirmed when that wave commits)
- **Impact on 06-05:** None. Insights page TS files compile clean (verified by isolated grep of build output — only the 6 new file paths). Vite build fails only on AlertThresholdsTab.

**Resolution path:** The owning plan's executor will see the same `npm run build` failure and fix in its own commit. Verification of 06-05 uses isolated `tsc` per insights file paths (clean) plus the fact that the chart components compiled fine in the previous build attempt (only error was added in this plan and fixed inline — `ctx.parsed.x/y` nullable cast).

**Update (06-07 wave-final):** 06-06 commit `b5ce8db` introduced `AlertThresholdsTab.tsx` but the 5 zodResolver TS errors persist in that file. **OWNERSHIP CONFIRMED: 06-06 (file created by `feat(06-06): ConfiguracoesPage 4 tabs ...`).** 06-07 verified isolated typecheck of OWN files succeeds (router/AppLayout/AppSidebar/Topbar/ExportButton/useExportCsv/vite.config + 3 wired pages). Full `npm run build` cannot pass until 06-06 fixes its `useForm<Schema>` generic — typical pattern: `useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })` instead of letting the resolver infer.

**2. TS errors in `torre-de-controle/src/app/pages/configuracoes/tabs/NotificationsTab.tsx`**

- **Status:** Untracked (parallel Wave 3 plan, likely 06-06)
- **Errors:**
  - `TS6133` — `useQuery` declared but never read (line 2)
  - `TS6133` — `api` declared but never read (line 9)
  - `TS2304` — Cannot find name `useUsers` (line 43)
  - `TS7006` — Parameter `u` implicitly `any` (line 44)
- **Why deferred:** File NOT owned by 06-05. `useUsers` hook lives in `torre-de-controle/src/hooks/useUsers.ts` (also untracked) — both belong to 06-06 push/users wave.

**3. TS error in `torre-de-controle/src/app/pages/viagens/components/ViagensTable.tsx`**

- **Status:** Modified by parallel Wave 3 plan (likely 06-07)
- **Error:** `TS2322` — `TripFilters` not assignable to `Record<string, unknown>` (line 148)
- **Why deferred:** File NOT owned by 06-05. Likely related to 06-07's router/lazy-route work touching ViagensPage filter integration.

---

**Verification approach used for 06-05:**
- `npm run build` output filtered with `grep -E "InsightsPage|insights/components|hooks/useInsights"` → empty (zero errors in 06-05 files)
- All TS errors above belong to files NOT in 06-05's `files_modified` list
- The full `tsc -b` cannot pass until parallel waves commit their fixes — this is expected in concurrent execution
- 06-05 SUMMARY documents: "isolated 06-05 files compile clean; full build awaits 06-06/06-07 commits"
