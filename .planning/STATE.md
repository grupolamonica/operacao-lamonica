---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: "Phase 06 DEPLOYED to VPS — stack healthy (Supabase + Redis + backend + frontend via Traefik). Pending: DNS A record torre.grupolamonica.com → 76.13.169.177"
last_updated: "2026-05-29T14:38:18.355Z"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 14
  completed_plans: 19
  percent: 100
---

## Current Position

- **Phase:** 06-insights-polish-deploy — IN PROGRESS (Wave 0/1/2 complete, Wave 3 frontend ready)
- **Completed Plan:** 06-07 (Wave 3 — frontend layout refactor: SidebarProvider + SidebarInset, 7 lazy route chunks, ExportButton + useExportCsv wired on 3 pages, vite.config sentryVitePlugin + manualChunks)
- **Next Plans:** Wave 4 deploy (06-08) — Railway backend + Cloudflare Pages frontend + Sentry uploads + CI/CD
- **Stopped at:** Phase 06 DEPLOYED to VPS — stack healthy (Supabase + Redis + backend + frontend via Traefik). Pending: DNS A record torre.grupolamonica.com → 76.13.169.177
- **Known issues:**
  - Elysia 1.4.28: POST routes with body schemas fail when loaded as plugins. Workaround: inline routes in index.ts.
  - Stale processes on port 3000 can mask route changes. Always kill all bun processes before testing.
  - BullMQ connection silently fails in Bun 1.3.13 — alert engine uses inline await.
  - Bun IS installed locally (1.3.13 on PATH) — prior phase notes saying "Bun NOT installed" are stale; Docker fallback unnecessary.

## Decisions

- @vitejs/plugin-react@4.3.4 (not 6.0.1 — v6 requires Vite 8, project locked to Vite 5)
- erasableSyntaxOnly removed from tsconfig (requires TS 5.8+, project uses 5.6)
- shadcn CLI dark variant additions to index.css accepted (inert, .dark never applied)
- useUIStore does NOT contain isSidebarCollapsed (shadcn SidebarProvider owns sidebar state)
- ViagensFiltersPanel filter state is local (useState in ViagensPage), not Zustand — avoids unnecessary global state for UI-only filtering
- ViagensTabs counts derived from full unfiltered useTrips() to show total counts per status independent of active filters
- TableWithSidePanel uses minmax(0,1fr) in gridTemplateColumns (prevents table overflow when panel opens)
- Hook contract { data, isLoading: false, isError: false, error: null, refetch: () => void } para compatibilidade Phase 2 TanStack Query
- SLAGauge implementado com SVG puro (strokeDasharray/strokeDashoffset) sem charting library
- AlertGroupedList colapso local (useState, não store) — UI state, não compartilhado
- AlertDetailPanel ações Phase 1 fazem console.log; persistência real na Phase 4
- Argon hex → oklch conversion for shadcn compat (D-05): primary=#0f62fe→oklch(0.485 0.224 258.6)
- All design tokens in @theme inline — no tailwind.config.ts (D-04, Tailwind v4 constraint)
- Single theme mechanism: .dark class on html, no applyTheme() (D-07)
- Status tokens paired bg+fg for dark mode contrast safety (D-11)
- Sidebar vars kept as Argon dark navy in both themes (always-dark sidebar)
- StatusBadge/SeverityBadge use inline style with CSS vars — bg-[oklch(...)] syntax not supported in Tailwind v4 for dynamic vars
- Status dot hex colors (#2dce89/#fb6340/#f5365c/#95959e) are allowlisted — constant across themes by design
- SparklineChart uses key={isDark} to force Chart.js re-mount on theme change
- success/info button variants added to shadcn CVA config
- Extra driver columns (email, base, deliveriesToday, avgDelayMinutes, lat, lng, address) added beyond ARCHITECTURE.md — required by frontend types.ts Driver interface
- Phase 6 Wave 0: web-push@3.6.7 + @sentry/node@10.55.0 + @sentry/react@10.55.0 + react-hook-form@7.76.1 + zod@4.4.3 pinned exactly (no caret)
- Phase 6 Wave 0: shared `scrubRecursive` mirror between api/src/lib/scrub.ts and torre-de-controle/src/lib/scrub.ts (17 SCRUB_KEYS, depth 8, Bearer regex)
- Phase 6 Wave 0: notification_preferences JSONB nullable on users — backend reads default fallback when NULL
- Phase 6 Wave 0: push_subscriptions.endpoint UNIQUE + user_id FK CASCADE + idx_push_subscriptions_user_id
- Phase 6 Wave 0: alert_thresholds key-value style (type=PK varchar(50), value INT) — seeds atraso_critico=30/desvio_km=2/stop_duration=15 idempotently
- Phase 6 Wave 0: Sentry init NOT wired in api/src/index.ts yet — lib scaffolded, side-effect activation deferred to 06-04 + 06-07
- Phase 6 Wave 0: drizzle-kit push NOT executed — schema applied via plan 06-08 against production Railway DB with --strict --verbose
- Phase 6 Wave 0: torre-de-controle/.gitignore added `!.env.example` exception so example file is tracked
- 06-03: Two-sub-plugin RBAC pattern (readPlugin authGuard + writePlugin requireRole) combined via .use() — avoids forcing admin on GET endpoints
- 06-03: writePlugin must chain .use(authGuard).use(requireRole).group() — Elysia 1.4 scope inference loses user derive through requireRole wrapper otherwise
- 06-03: passwordHash and apiKey masked at service projection layer (single project() helper) — no select * leak risk
- 06-04: publicKeyPlugin sub-plugin (no auth) + authedPlugin (.use(authGuard)) combined — public VAPID key must be reachable pre-subscription (RFC 8292)
- 06-04: web-push 410 Gone / 404 Not Found trigger DELETE FROM push_subscriptions — auto-cleanup of dead endpoints (Promise.allSettled iteration)
- 06-04: dispatchAlertPush severity filter via JSONB ->> text comparison: `notification_preferences->>${severity} = 'true'` (Drizzle sql template parameterized — safe vs T-06.04-06)
- 06-04: Alert engine fires push fire-and-forget AFTER `logger.info('alert created')` — deterministic log ordering, push never blocks telemetry pipeline (T-06.04-03)
- 06-04: import './lib/sentry' positioned at TOP of api/src/index.ts (before Elysia import) — Sentry async-hook instrumentation must wrap entire request lifecycle
- 06-04: wsPlugin must remain LAST in .use() chain (Elysia 1.4 plugin POST order rule — WebSocket upgrade handler conflicts with plugins registered after it)
- 06-04: Endpoint URL truncated to 40 chars + '...' in all push-related logger calls — endpoint URL carries auth identifier (T-06.04-08)
- 06-04 ENV/PROCESS: Windows `pkill -f` is unreliable for killing bun.exe — use `taskkill //F //IM bun.exe`. Stale bun processes binding port 3000 served OLD module cache and masked new plugin registration (false "NOT_FOUND 500" symptom).
- 06-04: `/api/exports/*.csv` routes register at runtime but are absent from `/swagger/json` due to `.csv` suffix — @elysiajs/swagger quirk. Routes ARE functional (Eden Treaty type inference unaffected)
- 06-06: NotificationsTab reads /api/auth/me (not /api/users) — works for all roles, no admin gate
- 06-06: usePushSubscription falls back to GET /api/push/vapid-public-key when VITE_VAPID_PUBLIC_KEY env unset — no build-time secret required
- 06-06: Service Worker registered with explicit { scope: '/' } at /sw.js — REQUIRED to receive push events on all SPA routes (RESEARCH Pitfall #2)
- 06-06: useUsers retry:false — admin-only endpoint deterministically 403s for non-admin; single error is enough
- 06-07: Router lazy() with .then(m => ({ default: m.NamedExport })) adapter — pages use named exports, React.lazy expects default-export module shape
- 06-07: Dashboard kept eager in entry chunk — most-used route, no Suspense delay on app boot
- 06-07: SidebarProvider owns sidebar state via React context (open/collapsed) — useUIStore intentionally does NOT mirror it (single source of truth)
- 06-07: SidebarTrigger lives in Topbar next to breadcrumb + Cmd/Ctrl+B keyboard shortcut (built into SidebarProvider)
- 06-07: ExportButton placed BOTH in page header (no filters → full export) AND table toolbar (current filters applied) on Viagens/Motoristas; AlertasPage only header (filters live at page level)
- 06-07: Tratativas export endpoint exists but NO UI button — no dedicated tratativas page (nested in AlertDetailPanel); reachable via direct API URL
- 06-07: ExportFilters typed as `Record<string, unknown> | object` — domain filter interfaces (TripFilters, AlertFilters, DriverFilters) lack index signature
- 06-07: vite.config sentryVitePlugin.disable = !process.env.SENTRY_AUTH_TOKEN — local/dev builds never error from missing token; sourcemap: 'hidden' generates maps without //# sourceMappingURL ref
- 06-07: manualChunks splits react-vendor / chart-vendor / map-vendor / query-vendor — stable named chunks for CDN cache invalidation

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01 | 01 | ~10min | 3 | 35 |
| 01 | 02 | 5m 31s | 3 | 28 |
| Phase 01-ui-shell-design-system P03 | 15min | 2 tasks | 13 files |
| 01 | 04 | 15min | 2 | 10 |
| 01 | 05 | ~15min | 2 | 11 |
| 01 | 06 | ~15min | 2 | 9 |
| 1b | 01 | ~15min | 4 | 3 |
| 1b | 02 | ~15min | 9 | 40 |
| 1b | 03 | ~10min | 7 | 1 |
| Phase 02-backend-core-auth-api-foundation P02 | 11min | 4 tasks | 12 files |
| 06 | 01 | ~18min | 2 | 21 |
| Phase 06-insights-polish-deploy P03 | 9min | 2 tasks | 6 files |
| 06 | 04 | ~25min | 2 | 5 |
| Phase 06 P06 | 35min | 2 tasks | 10 files |
| 06 | 07 | ~13min | 2 | 12 |

## Quick Tasks Completed

| ID | Slug | Date | Commit | Description |
|----|------|------|--------|-------------|
| 260429-csm | viagens-filter-refactor | 2026-04-29 | 0531d97 | Replace sidebar filters + status tabs with inline toolbar matching Motoristas pattern |

## Last Session

- **Timestamp:** 2026-05-29T11:53:14Z
- **Stopped at:** Phase 06 Plan 07 (Wave 3 — SidebarProvider + lazy routes + ExportButton + Sentry vite) complete — commits 59c2fc9 + aaa9bda + e2cd362
- **Resume file:** --resume-file
