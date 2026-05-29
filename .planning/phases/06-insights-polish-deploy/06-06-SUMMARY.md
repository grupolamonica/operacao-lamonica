---
phase: 06-insights-polish-deploy
plan: 06
subsystem: frontend
tags: [configuracoes, web-push, service-worker, react-hook-form, zod, rbac, tabs, datatable, dialog]

# Dependency graph
requires:
  - phase: 06-01
    provides: "shadcn Form (form.tsx with FormField/FormItem/FormControl/FormLabel/FormMessage), Dialog, Checkbox, Select components; react-hook-form@7.76.1 + @hookform/resolvers@5.4.0 + zod@4.4.3 pinned"
  - phase: 06-03
    provides: "Backend modules wired: users.plugin.ts (CRUD + me/notification-preferences), thresholds.plugin.ts (60s cache), gps-providers.plugin.ts (masked apiKey)"
  - phase: 06-04
    provides: "push.plugin.ts (GET vapid-public-key, POST subscribe, POST unsubscribe), dispatchAlertPush (alert engine push hook)"
provides:
  - "4 TanStack Query CRUD hooks consuming Eden Treaty endpoints (useUsers, useThresholds, useGpsProviders, usePushSubscription)"
  - "Service Worker at public/sw.js — push event → showNotification, notificationclick → openWindow/focus"
  - "usePushSubscription state machine: idle/enabling/enabled/denied/unsupported/error with explicit scope:'/' SW register"
  - "ConfiguracoesPage with 4 shadcn Tabs (Usuários / Alertas / Notificações / Integrações GPS) replacing stub"
  - "UsersTab CRUD via DataTable + Dialog create/edit + soft-delete; RBAC admin-only controls"
  - "AlertThresholdsTab RHF+Zod form with 3 thresholds (parallel PATCH per key)"
  - "NotificationsTab push opt-in + per-severity prefs (critico/medio/baixo) reading /api/auth/me"
  - "GpsProvidersTab CRUD with Phase 7+ stub warning banner"
affects: [06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hook contract { data, isLoading, isError, error, refetch } — consistent with useGeofences/useTrips/useAlerts (Phase 2)"
    - "Eden Treaty cast pattern `(api.api.xxx as any).get/post/[id].patch/[id].delete` — works around inter-module Elysia type version drift"
    - "Mutation onSuccess: queryClient.invalidateQueries({ queryKey: ['xxx'] }) — auto-refetch after writes"
    - "Service Worker registered with explicit `{ scope: '/' }` to receive push events regardless of SPA route (RESEARCH Pitfall #2)"
    - "VAPID public key fetched at runtime from /api/push/vapid-public-key as fallback when VITE_VAPID_PUBLIC_KEY env unset — no build-time secret required"
    - "RHF `values: ...` prop (not `defaultValues`) for edit dialog — re-syncs form whenever the source row changes (TanStack Query refetch)"
    - "Client-side RBAC gates write controls via `useAuthStore().user.role === 'admin'`; server is source of truth (requireRole middleware)"
    - "Soft-delete only for users: DELETE endpoint sets isActive=false server-side (FK chain preserved for assigned alerts/treatments)"
    - "apiKey field mask handling in GpsProvidersTab edit: only sends apiKey on PATCH if user typed a non-mask replacement (skips ••••last4)"

key-files:
  created:
    - "torre-de-controle/src/hooks/useUsers.ts"
    - "torre-de-controle/src/hooks/useThresholds.ts"
    - "torre-de-controle/src/hooks/useGpsProviders.ts"
    - "torre-de-controle/src/hooks/usePushSubscription.ts"
    - "torre-de-controle/public/sw.js"
    - "torre-de-controle/src/app/pages/configuracoes/tabs/UsersTab.tsx"
    - "torre-de-controle/src/app/pages/configuracoes/tabs/AlertThresholdsTab.tsx"
    - "torre-de-controle/src/app/pages/configuracoes/tabs/NotificationsTab.tsx"
    - "torre-de-controle/src/app/pages/configuracoes/tabs/GpsProvidersTab.tsx"
  modified:
    - "torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx"

key-decisions:
  - "NotificationsTab reads /api/auth/me directly (TanStack Query) instead of useUsers list — useUsers is admin-only (403 for non-admin), so non-admin users would see noisy errors; me endpoint works for all roles"
  - "useUsers configured with retry:false — single 403 is enough to know caller lacks admin permission; avoids spam retries"
  - "usePushSubscription falls back to GET /api/push/vapid-public-key if VITE_VAPID_PUBLIC_KEY env not set at build time — frontend doesn't need the key at build time, only at subscribe time"
  - "usePushSubscription preserves 'denied' status when permission rejection happens during the enabling flow — does not overwrite with generic 'error' state"
  - "Service Worker icon-192.png / icon-512.png left as references in sw.js but files NOT shipped — browser shows default app icon when 404; documented as post-deploy operational item"
  - "AlertThresholdsTab parallel Promise.all() of 3 PATCH /api/thresholds/:type calls — backend invalidates in-memory cache per key (60s window may show stale value briefly until cache regenerates)"
  - "All 4 tabs gate write controls on `useAuthStore().user.role === 'admin'`; non-admin sees read-only view + 'ShieldOff' icon hint. Server enforces via requireRole('admin')"
  - "GpsProvidersTab edit: apiKey field only forwarded to PATCH if user typed something that doesn't start with '••••' (mask prefix) — preserves existing key when admin edits other fields"
  - "Dialogs use `values: ... | undefined` prop pattern on useForm so RHF re-syncs whenever the edited row changes — avoids manual useEffect(reset()) calls"

patterns-established:
  - "Phase 6 frontend RBAC pattern: `const isAdmin = useAuthStore().user?.role === 'admin'` gates UI controls; server requireRole middleware is source of truth"
  - "Tab content as separate files (one per tab) inside `pages/{page}/tabs/` — keeps ConfiguracoesPage.tsx as pure shell"
  - "DataTable + Dialog idiom for admin CRUD pages: toolbar with 'Novo X' button, row action buttons (Pencil/UserX/Trash2), modal create/edit forms with RHF+Zod"
  - "Push status state machine pattern: useEffect on mount detects unsupported/denied/already-subscribed; enablePush async with finite states; disablePush teardown to idle"

requirements-completed:
  - PHASE6-CONFIG-USERS-TAB
  - PHASE6-CONFIG-THRESHOLDS-TAB
  - PHASE6-CONFIG-GPS-PROVIDERS-TAB
  - PHASE6-CONFIG-NOTIFICATIONS-TAB
  - PHASE6-WEB-PUSH-SUBSCRIBE-UI
  - PHASE6-WEB-PUSH-SERVICE-WORKER

# Metrics
duration: ~35min
completed: 2026-05-29
---

# Phase 6 Plan 06: Configurações 4 tabs + Service Worker Summary

**Replaces ConfiguracoesPage stub with 4 functional tabs (Usuários/Alertas/Notificações/GPS Integrations); 4 TanStack Query CRUD hooks consuming Eden Treaty endpoints from 06-03 (users/thresholds/gps-providers) + 06-04 (push); Service Worker at public/sw.js handles push event + notificationclick; usePushSubscription state machine drives the Notificações tab opt-in flow with explicit scope:'/' SW registration.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-29T08:35Z
- **Completed:** 2026-05-29T09:10Z
- **Tasks:** 2
- **Files created:** 9 (4 hooks + 4 tabs + 1 SW)
- **Files modified:** 1 (ConfiguracoesPage.tsx — stub → 4-tabs shell)

## Accomplishments

**Task 1 — CRUD hooks + Service Worker (commit `06b191b`):**
- `useUsers` — list / create / update / deactivate (soft) / updateMyPreferences. Disabled retry (admin-only endpoints return 403 for non-admins; single error is enough).
- `useThresholds` — list (Record<string, number>) + per-key update (server invalidates 60s in-memory cache).
- `useGpsProviders` — full CRUD; server returns apiKey masked as `••••last4` on every response.
- `usePushSubscription` — finite state machine (idle / enabling / enabled / denied / unsupported / error) with: mount-time subscription check, runtime VAPID public key fetch (env-or-server fallback), explicit `register('/sw.js', { scope: '/' })` (RESEARCH Pitfall #2), permission request, subscribe + persist via `POST /api/push/subscribe`, disable via unsubscribe + `POST /api/push/unsubscribe`.
- `public/sw.js` — install/activate lifecycle (skipWaiting + clients.claim), push event handler with safe JSON parse fallback + `showNotification(title, { body, icon, badge, data, tag, requireInteraction: true })`, notificationclick handler with matchAll/focus + openWindow fallback.

**Task 2 — ConfiguracoesPage shell + 4 tabs (commit `b5ce8db`):**
- `ConfiguracoesPage.tsx` — full stub replacement: header + shadcn `<Tabs defaultValue="users">` with 4 trigger/content panels.
- `UsersTab.tsx` — DataTable with columns [name, email, role (Badge), isActive (Badge), createdAt, actions]; toolbar with "Novo usuário" button (admin only); Dialog forms with RHF+Zod for create (`name+email+role+password ≥6`) and edit (`role+isActive`); soft-delete via deactivateMutation with confirm() prompt.
- `AlertThresholdsTab.tsx` — single RHF+Zod form, 3 numeric fields (`atrasoCriticoMinutes 1-300`, `desvioKmThreshold 0.1-50`, `stopDurationMinutes 1-120`); useEffect hydrates form from server data; submit fires 3 parallel PATCH calls; success/error banners; disabled when non-admin.
- `NotificationsTab.tsx` — two sections: (1) push opt-in with Ativar/Desativar buttons reflecting `push.status`, status label, iOS Safari note, error banner; (2) per-severity Checkbox prefs (critico/medio/baixo) with severity color dots, saves via `useUpdateMyPreferences`. Reads current prefs from `/api/auth/me` (works for all roles).
- `GpsProvidersTab.tsx` — DataTable + ProviderDialog (shared create/edit), warning banner ("Stub Phase 6: form persiste config mas não conecta efetivamente"); fields name+baseUrl+apiKey+isActive with RHF+Zod; apiKey field omitted from PATCH when value still starts with `••••` (preserves server-side stored key).

## Task Commits

| # | Task                                                              | Commit  | Files                                                                                                       |
|---|-------------------------------------------------------------------|---------|-------------------------------------------------------------------------------------------------------------|
| 1 | 4 CRUD hooks + Service Worker (useUsers/Thresholds/GpsProviders/PushSubscription/sw.js) | `06b191b` | useUsers.ts, useThresholds.ts, useGpsProviders.ts, usePushSubscription.ts, public/sw.js |
| 2 | ConfiguracoesPage 4 tabs (UsersTab/AlertThresholdsTab/NotificationsTab/GpsProvidersTab) | `b5ce8db` | ConfiguracoesPage.tsx + 4 tab files (+ 5 Insights files swallowed from 06-05 — see Deviations) |

## Verification

- **`npx tsc --noEmit`:** **DEFERRED** — sandbox denied execution of `npx tsc` / `node tsc` / `npm run build` commands during this session (multiple denials). Hooks and tabs were authored using exact patterns from existing files (`useGeofences.ts`, `MotoristasTable.tsx`, `LoginPage.tsx`), conforming to:
  - `useGeofences` Eden Treaty + TanStack Query contract (`useQuery` + `useMutation` with `onSuccess: () => qc.invalidateQueries(...)`)
  - shadcn Form API from `form.tsx` (FormField/FormItem/FormControl/FormLabel/FormMessage with `useForm` + `zodResolver`)
  - shadcn Dialog API from `dialog.tsx` (Dialog/DialogContent/DialogHeader/DialogTitle/DialogDescription/DialogFooter)
  - DataTable<T> generic from `DataTable.tsx` (requires `T extends { id: string }` — both User and GpsProvider have `id: string`)
  - Zustand `useAuthStore` accessed via destructuring (`const { user } = useAuthStore()`)
  - Verifier wave must run `cd torre-de-controle && npx tsc --noEmit && npm run build` to fully confirm — these commands are inaccessible from the executor sandbox.
- **File presence:** all 10 target files exist on disk with non-empty content.
- **String contract checks (acceptance criteria from plan):**
  - `useUsers.ts` exports `useUsers, useCreateUser, useUpdateUser, useDeactivateUser, useUpdateMyPreferences` ✓
  - `useThresholds.ts` exports `useThresholds, useUpdateThreshold` ✓
  - `useGpsProviders.ts` exports `useGpsProviders, useCreateGpsProvider, useUpdateGpsProvider, useDeleteGpsProvider` ✓
  - `usePushSubscription.ts` exports `usePushSubscription` and contains `navigator.serviceWorker.register('/sw.js', { scope: '/' })` + `VITE_VAPID_PUBLIC_KEY` reference ✓
  - `public/sw.js` contains `showNotification` and `notificationclick` handlers + `event.waitUntil` ✓
  - `ConfiguracoesPage.tsx` contains `<Tabs defaultValue="users">` and references `UsersTab/AlertThresholdsTab/NotificationsTab/GpsProvidersTab` ✓ (`Construction` / `Disponível em Phase 6` strings removed from stub ✓)
  - `AlertThresholdsTab.tsx` contains `zodResolver` + `useThresholds` + `useUpdateThreshold` ✓
  - `NotificationsTab.tsx` contains `usePushSubscription` + `enablePush` references ✓
  - `UsersTab.tsx` contains `useUsers` reference ✓
  - `GpsProvidersTab.tsx` contains `useGpsProviders` reference ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Commit boundary bug] Wave 3 sibling 06-05 untracked Insights files swallowed into Task 2 commit**

- **Found during:** Task 2 commit verification (`git show --stat HEAD`)
- **Issue:** When orchestrator spawned this executor, the worktree contained 5 untracked files belonging to plan 06-05 (Insights page implementation): `InsightsPage.tsx` (modified), `components/AlertasDistribuicaoChart.tsx`, `components/MotoristasRankingChart.tsx`, `components/RotasProblematicasTable.tsx`, `components/SlaHistoricoChart.tsx`. Despite running `git add` with specific paths (only my 5 Configurações files), `git commit` produced 10 files in commit `b5ce8db` — the Insights files were apparently in the index from a prior staging operation by the parallel 06-05 worktree.
- **Fix:** Attempted `git reset --soft HEAD~1` to unstage and recommit cleanly — **sandbox denied destructive git operations**. Decided to accept the commit and document. Code changes themselves are isolated and correct; only the commit boundary is wrong. Plan 06-05's verifier must reconcile: Insights work is now in commit `b5ce8db` instead of a dedicated 06-05 commit. **No code merge conflict** — Insights files are different paths from Configurações files, both implementations coexist correctly.
- **Files modified:** none (only commit-time scope issue)
- **Commit:** `b5ce8db` (intended scope was 5 files; actual scope was 10)

**2. [Rule 2 - Robustness] NotificationsTab now reads /api/auth/me (not /api/users) for current user prefs**

- **Found during:** Task 2 design review (mid-implementation)
- **Issue:** Initial implementation used `useUsers()` (list endpoint) to find the current user's `notificationPreferences`. But `/api/users` is admin-only (returns 403 for non-admin); calling it from NotificationsTab — which must work for all roles — would spam error retries and surface a confusing "Falha ao carregar usuários" banner unrelated to the actual notifications UX.
- **Fix:** Replaced `useUsers()` with a dedicated `useQuery({ queryKey: ['auth','me-prefs'], queryFn: api.api.auth.me.get })` that all authenticated users can call (matches `useAuthStore.me()` pattern); retry disabled, staleTime 30s, enabled when authUser present; falls back to `{ critico: true }` default when API unreachable.
- **Files modified:** `torre-de-controle/src/app/pages/configuracoes/tabs/NotificationsTab.tsx` (imports `useQuery` + `api` directly, removes `useUsers` import)
- **Commit:** rolled into `b5ce8db` (single Task 2 commit)

**3. [Rule 2 - Robustness] useUsers retry disabled**

- **Found during:** Task 1 hook authoring
- **Issue:** TanStack Query default retry (3x) on 403 would generate noisy network failures every time a non-admin views the Users tab (or any component that calls `useUsers`). Server returns 403 deterministically — retrying won't help.
- **Fix:** Added `retry: false` to the `useQuery` config in `useUsers.ts`.
- **Files modified:** `torre-de-controle/src/hooks/useUsers.ts`
- **Commit:** rolled into `06b191b`

### Architectural Decisions

- None — no architectural deviations from the plan. All structure (4 tabs / 1 SW / 4 hooks / 1 page) matches the spec exactly.

### Deferred Items

**1. Sandbox-denied TypeScript verification**

- `npx tsc --noEmit` and `npm run build` were denied by the executor sandbox (3 attempts, all permission errors). The verifier wave (next orchestrator step) **must** run these commands manually to confirm zero TS errors before merging Wave 3. Patterns followed are conservative (mirror existing hooks line-for-line) so high confidence the code compiles, but a real type check is the gate.

**2. SW icon assets (`icon-192.png` / `icon-512.png`)**

- `public/sw.js` references `/icon-192.png` for `icon` and `badge` Notification fields. Files NOT shipped in `public/`. Browser shows default app favicon — acceptable for MVP. Add real PWA icons in Phase 7+ when designing the install/launch experience. README/deploy docs should mention this.

**3. VAPID env var at build time**

- `usePushSubscription` falls back to `GET /api/push/vapid-public-key` when `import.meta.env.VITE_VAPID_PUBLIC_KEY` is unset, so frontend builds succeed without VAPID env. Production deploy must set the env on Cloudflare Pages (per D-11) OR rely on the server endpoint at runtime — server endpoint returns `null` in dev without backend VAPID env, which causes `usePushSubscription.enablePush()` to surface a clear "VAPID public key não disponível" error to the user.

## Push Flow End-to-End (D-11..D-16 verification trace)

```
1. User clicks "Ativar Notificações" in NotificationsTab
   → usePushSubscription.enablePush() runs
2. setStatus('enabling') + setError(null)
3. Resolve VAPID public key:
   a. import.meta.env.VITE_VAPID_PUBLIC_KEY (if set at build time)
   b. fallback: GET /api/push/vapid-public-key (api.api.push['vapid-public-key'].get())
4. Register SW:
   navigator.serviceWorker.register('/sw.js', { scope: '/' })
   await navigator.serviceWorker.ready
5. Request permission:
   await Notification.requestPermission()
   if 'denied' → setStatus('denied') + throw 'Permissão de notificação negada'
6. Subscribe:
   reg.pushManager.subscribe({
     userVisibleOnly: true,
     applicationServerKey: urlBase64ToUint8Array(publicKey)
   })
7. Persist to backend:
   POST /api/push/subscribe { endpoint, keys: { p256dh, auth } }
   (userId derived server-side from JWT cookie — T-06.04-01 / T-06.06-01)
8. setStatus('enabled')
9. Backend dispatcher (06-04 push.dispatcher.ts) reads users.notification_preferences->>severity='true'
   and fires webpush.sendNotification(subscription, payload) to all matching subscribers
10. Browser delivers push event to /sw.js
    → self.registration.showNotification(title, { body, icon, badge, tag, data: { url }, requireInteraction })
11. User clicks notification
    → 'notificationclick' fires
    → self.clients.matchAll → focus existing window if URL matches
    → otherwise self.clients.openWindow(url)
```

## RHF Schemas Reference

```typescript
// UsersTab — Create
z.object({
  name:     z.string().min(1).max(100),
  email:    z.string().email(),
  role:     z.enum(['admin', 'supervisor', 'analyst', 'viewer']),
  password: z.string().min(6),
})

// UsersTab — Edit
z.object({
  role:     z.enum(['admin', 'supervisor', 'analyst', 'viewer']),
  isActive: z.boolean(),
})

// AlertThresholdsTab
z.object({
  atrasoCriticoMinutes: z.coerce.number().int().positive().max(300),
  desvioKmThreshold:    z.coerce.number().positive().max(50),
  stopDurationMinutes:  z.coerce.number().int().positive().max(120),
})

// GpsProvidersTab
z.object({
  name:     z.string().min(1).max(100),
  baseUrl:  z.union([z.string().url(), z.literal('')]).optional(),
  apiKey:   z.string().max(500).optional(),
  isActive: z.boolean(),
})
```

## RBAC Enforcement Points (D-17, D-18, D-19, D-20)

| Tab            | Read scope                | Write scope (UI gated)           | Server enforcement       |
| -------------- | ------------------------- | -------------------------------- | ------------------------ |
| UsersTab       | admin only (list)         | admin only (create/edit/deactivate) | `requireRole('admin')` |
| AlertsTab      | any authenticated         | admin only (Salvar button disabled) | `requireRole('admin')` PATCH |
| NotificationsTab | self (any role)         | self (any role)                  | `authGuard` (self only)  |
| GpsProvidersTab | any authenticated         | admin only (toolbar + actions hidden) | `requireRole('admin')` |

All client-side RBAC reads `useAuthStore().user?.role === 'admin'`. Backend `requireRole` middleware (api/src/lib/rbac.ts) is the source of truth — never trust the client.

## Threat Model Compliance (06-06 register)

- **T-06.06-01 (Spoofing subscription):** ✓ mitigated — `usePushSubscription.enablePush` sends only `{ endpoint, keys }` to `POST /api/push/subscribe`. userId NEVER in request body; derived server-side from JWT cookie (per 06-04 plan).
- **T-06.06-02 (SW scope mismatch):** ✓ mitigated — `register('/sw.js', { scope: '/' })` explicitly; SW file lives at `public/sw.js` (root).
- **T-06.06-03 (XSS via notification body):** ✓ mitigated — browser-native Notification API does not execute HTML/JS.
- **T-06.06-04 (Open redirect on notificationclick):** ✓ mitigated — `event.notification.data.url` controlled by backend dispatcher (06-04 alert dispatcher builds `/alertas/${alert.id}` literal); SW trusts payload.data.url as-is per design.
- **T-06.06-05 (Lock-screen disclosure):** accepted — payload contains only alert title + body (no PII / lat / lng).
- **T-06.06-06 (Admin sees emails):** accepted — admin-only endpoint; internal operational data.
- **T-06.06-07 (Threshold race):** mitigated — 60s cache invalidation per key after PATCH; admin documented in AlertThresholdsTab UI ("cache será invalidado em até 60s").
- **T-06.06-08 (XSS in DataTable cells):** ✓ mitigated — React JSX auto-escapes; no `dangerouslySetInnerHTML`.

## Self-Check: PASSED

- Files created (verified via Read on each path):
  - FOUND: torre-de-controle/src/hooks/useUsers.ts
  - FOUND: torre-de-controle/src/hooks/useThresholds.ts
  - FOUND: torre-de-controle/src/hooks/useGpsProviders.ts
  - FOUND: torre-de-controle/src/hooks/usePushSubscription.ts
  - FOUND: torre-de-controle/public/sw.js
  - FOUND: torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx (modified)
  - FOUND: torre-de-controle/src/app/pages/configuracoes/tabs/UsersTab.tsx
  - FOUND: torre-de-controle/src/app/pages/configuracoes/tabs/AlertThresholdsTab.tsx
  - FOUND: torre-de-controle/src/app/pages/configuracoes/tabs/NotificationsTab.tsx
  - FOUND: torre-de-controle/src/app/pages/configuracoes/tabs/GpsProvidersTab.tsx
- Commits (verified via `git log --oneline`):
  - FOUND: 06b191b — Task 1 (hooks + SW)
  - FOUND: b5ce8db — Task 2 (page + tabs) [over-scoped to include 06-05 Insights files — documented under Deviations]

**Note for verifier:** Type-check (`tsc --noEmit`) and build (`npm run build`) gates were inaccessible from the executor sandbox. The verifier wave must run these manually. Confidence is HIGH that code compiles (mirrors existing patterns line-for-line), but the gate stays MANDATORY before any merge.
