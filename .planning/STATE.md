---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: milestone
status: unknown
stopped_at: Completed 07-03-PLAN.md (Wave 2 — ranking reads + sheets CSV + redis cache)
last_updated: "2026-05-29T20:13:00.000Z"
progress:
  total_phases: 11
  completed_phases: 1
  total_plans: 18
  completed_plans: 22
  percent: 100
---

## Current Position

- **Phase:** 07-ranking-backend — IN PROGRESS (Wave 1: 07-01 + 07-02 complete · Wave 2: 07-03 complete)
- **Completed Plan:** 07-03 (Wave 2 — I/O layer: ranking.reads.ts com 5 reads via rankSupabase service_role [evaluations/driver_blocks/evaluation_logs/route_scores/drivers paginado] + ranking.sheets.ts getSheetTrips fetch CSV gviz público + parse SheetTrip[] + cache Redis ranking:sheets:trips EX 60; erro PROPAGA [diverge do source que engolia]; tsc exit 0)
- **Next Plans:** 07-04 (service de composição + endpoints GET /api/ranking/* atrás do authGuard + checkpoint do service_role real contra ride-rank)
- **Stopped at:** Completed 07-03-PLAN.md (Wave 2 — ranking reads + sheets CSV + redis cache)
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
- 07-01: ranking usa client @supabase/supabase-js@2.106.2 separado (DB EXTERNO ride-rank vrlhfgfyjvkzfnafibnc), NÃO o Drizzle/postgres.js do Torre — DBs distintos (D-V2-01 PROXY)
- 07-01: rankSupabase usa service_role (não anon) — RLS do ride-rank bloqueia anon em 4 das 5 tabelas; bypass server-side inerente ao proxy (T-07-03 accept, mitigado pelo authGuard no 07-04)
- 07-01: rankSupabase fail-fast no module-load (espelha redis/client.ts); service_role NUNCA logado, nunca VITE_ (T-07-01); auth persistSession:false/autoRefreshToken:false
- 07-01: RANK_SUPABASE_SERVICE_KEY fica VAZIO no .env.example + comentário server-side only (T-07-02); valor real só no .env do servidor
- 07-01: tsc full-project falha em ranking.scoring.test.ts (07-02 em RED, fora de escopo) — registrado em deferred-items.md; tsc excluindo esse arquivo = exit 0
- 07-02: scoring ranking portado 1:1 de dataAdapter.ts (D-V2-04 — algoritmo reusado, nao reescrito); camada 100% pura sem I/O
- 07-02: getRouteBasePoints e FONTE UNICA em ranking.routes.ts; scoring importa (sem copia) — anti-drift T-07-13
- 07-02: paridade byte-a-byte dos literais de fallback — mojibake 'a€"' (x4) em transformTrips/vinculo, em-dash limpo '—' (x3) em no-show, 'Nao atribuido' ASCII (x2); SEM normalizar encoding (Phase 8)
- 07-02: golden-sample bun test com score_final/pontuacao travados (1+3=4) + NO SHOW score 0 — prova paridade ponta-a-ponta
- 07-03: I/O layer dividido em 2 módulos — ranking.reads.ts (Supabase) + ranking.sheets.ts (CSV+cache); consumidos pelo service de composição do 07-04
- 07-03: ranking.reads.ts só LEITURA via rankSupabase (5 tabelas) — insert/upsert/update/delete ausentes (writes são Phase 9); verificado por grep vazio
- 07-03: fetchDrivers paginado em .range(from, from+999) em loop até página < 1000 — preserva comportamento do ride-rank p/ >1000 motoristas
- 07-03: getRouteBasePoints NÃO redefinido — só fetchRouteScores lê route_scores; a regra pura segue fonte única em ranking.routes (07-02, anti-drift T-07-13)
- 07-03: ranking.sheets.ts CSV_URL montado de RANK_SHEET_ID/RANK_SHEET_TAB com fallback público (sheet 1MWTiaXU3HXW.../DBLHHISTORICO); fetch sem credencial
- 07-03: cache in-memory do source (cachedTrips/fetchPromise) trocado por Redis do Torre (ranking:sheets:trips EX 60) — D-V2 short cache T-07-07
- 07-03: getSheetTrips PROPAGA erro de fetch (diverge do source que retornava [] silencioso) — endpoint do 07-04 trata; só response.status no throw, nunca o CSV/PII (T-07-06)
- 07-03: .from('<tabela>') colado na linha do rankSupabase + literal 'EX', 60 inline no redis.set — exigência dos greps line-based do plano (key_links + acceptance)

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
| Phase 07 P01 | ~12min | 3 tasks | 4 files |
| Phase 07 P02 | ~12min | 1 tasks | 4 files |
| Phase 07 P03 | ~12min | 2 tasks | 2 files |

## Quick Tasks Completed

| ID | Slug | Date | Commit | Description |
|----|------|------|--------|-------------|
| 260429-csm | viagens-filter-refactor | 2026-04-29 | 0531d97 | Replace sidebar filters + status tabs with inline toolbar matching Motoristas pattern |

## Last Session

- **Timestamp:** 2026-05-29T20:13:00Z
- **Stopped at:** Phase 07 Plan 03 (Wave 2 — ranking I/O layer: ranking.reads.ts 5 reads via rankSupabase + ranking.sheets.ts getSheetTrips CSV gviz + Redis EX 60) complete — commit fb9254c
- **Resume file:** None
