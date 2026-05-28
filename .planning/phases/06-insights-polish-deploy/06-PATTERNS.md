# Phase 6: Insights + Polish + Deploy — Pattern Map

**Mapped:** 2026-05-28
**Files analyzed:** 45 (new + modified)
**Analogs found:** 42 / 45

## File Classification

### Backend (api/)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `api/src/db/schema/push-subscriptions.ts` | model | CRUD | `api/src/db/schema/users.ts` + `alerts.ts` | exact |
| `api/src/db/schema/alert-thresholds.ts` | model | CRUD | `api/src/db/schema/users.ts` (simple table) | exact |
| `api/src/db/schema/gps-providers.ts` | model | CRUD | `api/src/db/schema/users.ts` | exact |
| `api/src/db/schema/users.ts` (MODIFY) | model | CRUD | (self — add `notificationPreferences` JSONB) | exact |
| `api/src/db/schema/relations.ts` (MODIFY) | model | — | (self — add pushSubscriptions relation) | exact |
| `api/src/db/schema/index.ts` (MODIFY) | barrel | — | (self — re-export new schemas) | exact |
| `api/src/db/seed/index.ts` (MODIFY) | script | batch | (self — seed alert_thresholds defaults) | exact |
| `api/src/lib/vapid.ts` | utility | config | `api/src/lib/logger.ts` (env-based init) | role-match |
| `api/src/lib/sentry.ts` | utility | config | `api/src/lib/logger.ts` (env-based init) | role-match |
| `api/src/modules/insights/insights.service.ts` | service | aggregate-read | `api/src/modules/dashboard/dashboard.service.ts` | exact |
| `api/src/modules/insights/insights.plugin.ts` | controller | request-response | `api/src/modules/dashboard/dashboard.plugin.ts` | exact |
| `api/src/modules/exports/exports.service.ts` | service | streaming | `api/src/modules/trips/trips.service.ts` (filters) | role-match |
| `api/src/modules/exports/exports.csv.ts` | utility | transform | (no analog — new CSV helpers) | none |
| `api/src/modules/exports/exports.plugin.ts` | controller | streaming-response | `api/src/modules/trips/trips.plugin.ts` (filters) | role-match |
| `api/src/modules/push/push.service.ts` | service | event-driven + CRUD | `api/src/modules/alerts/alerts.service.ts` + `auth.service.ts` | role-match |
| `api/src/modules/push/push.dispatcher.ts` | service | event-driven | `api/src/jobs/alert-inline.ts` | role-match |
| `api/src/modules/push/push.plugin.ts` | controller | request-response | `api/src/modules/alerts/alerts.plugin.ts` | exact |
| `api/src/modules/users/users.service.ts` | service | CRUD | `api/src/modules/auth/auth.service.ts` (bcrypt) + `drivers.service.ts` (CRUD) | exact |
| `api/src/modules/users/users.plugin.ts` | controller | CRUD | `api/src/modules/trips/trips.plugin.ts` + `geofences.plugin.ts` (CRUD) | exact |
| `api/src/modules/thresholds/thresholds.service.ts` | service | CRUD + cache | `api/src/modules/dashboard/dashboard.service.ts` (cache) | role-match |
| `api/src/modules/thresholds/thresholds.plugin.ts` | controller | CRUD | `api/src/modules/geofences/geofences.plugin.ts` | exact |
| `api/src/modules/gps-providers/gps-providers.service.ts` | service | CRUD | `api/src/modules/drivers/drivers.service.ts` | exact |
| `api/src/modules/gps-providers/gps-providers.plugin.ts` | controller | CRUD | `api/src/modules/geofences/geofences.plugin.ts` | exact |
| `api/src/modules/alerts/alerts.service.ts` (MODIFY) | service | event-driven | (self — add push dispatch hook after insert) | exact |
| `api/src/jobs/alert-inline.ts` (MODIFY) | service | event-driven | (self — call push dispatcher after insert) | exact |
| `api/src/index.ts` (MODIFY) | config | — | (self — wire plugins + Sentry init) | exact |
| `api/src/types/api.ts` (MODIFY) | barrel | — | (self — re-export new modules) | exact |
| `api/.env.example` (MODIFY) | config | — | (self — add VAPID/SENTRY vars) | exact |

### Frontend (torre-de-controle/)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `torre-de-controle/src/app/pages/insights/InsightsPage.tsx` | component | request-response | `torre-de-controle/src/app/pages/alertas/AlertasPage.tsx` (filter state + multi-section) | role-match |
| `torre-de-controle/src/app/pages/insights/components/SlaHistoricoChart.tsx` | component | render | `torre-de-controle/src/components/domain/SparklineChart.tsx` | exact |
| `torre-de-controle/src/app/pages/insights/components/MotoristasRankingChart.tsx` | component | render | `torre-de-controle/src/components/domain/SparklineChart.tsx` | role-match |
| `torre-de-controle/src/app/pages/insights/components/RotasProblematicasTable.tsx` | component | render | `torre-de-controle/src/components/domain/DataTable.tsx` (usage in MotoristasTable) | role-match |
| `torre-de-controle/src/app/pages/insights/components/AlertasDistribuicaoChart.tsx` | component | render | `torre-de-controle/src/components/domain/SparklineChart.tsx` (chart pattern) | role-match |
| `torre-de-controle/src/app/pages/insights/components/DateRangePicker.tsx` | component | form-input | `torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx` (toolbar select pattern) | role-match |
| `torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx` | component | request-response | `torre-de-controle/src/components/ui/tabs.tsx` (shadcn) | role-match |
| `torre-de-controle/src/app/pages/configuracoes/tabs/UsersTab.tsx` | component | CRUD | `torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx` | exact |
| `torre-de-controle/src/app/pages/configuracoes/tabs/AlertThresholdsTab.tsx` | component | form-submit | (no analog — new form pattern) | none — see RESEARCH Pattern 10 |
| `torre-de-controle/src/app/pages/configuracoes/tabs/NotificationsTab.tsx` | component | form-submit | (no analog — first SW + Push UI) | none — see RESEARCH Pattern 3 |
| `torre-de-controle/src/app/pages/configuracoes/tabs/GpsProvidersTab.tsx` | component | CRUD | `torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx` | role-match |
| `torre-de-controle/src/hooks/useInsights.ts` | hook | request-response | `torre-de-controle/src/hooks/useDashboardKPIs.ts` | exact |
| `torre-de-controle/src/hooks/useExportCsv.ts` | hook | side-effect | (no analog — first window.location download) | role-match — Button onClick |
| `torre-de-controle/src/hooks/usePushSubscription.ts` | hook | side-effect | (no analog — SW + PushManager) | none — see RESEARCH Pattern 3 |
| `torre-de-controle/src/hooks/useUsers.ts` | hook | CRUD | `torre-de-controle/src/hooks/useGeofences.ts` (useQuery+useMutation) | exact |
| `torre-de-controle/src/hooks/useThresholds.ts` | hook | CRUD | `torre-de-controle/src/hooks/useGeofences.ts` | exact |
| `torre-de-controle/src/hooks/useGpsProviders.ts` | hook | CRUD | `torre-de-controle/src/hooks/useGeofences.ts` | exact |
| `torre-de-controle/src/components/common/ExportButton.tsx` | component | side-effect | `torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx` toolbar `<Button>` | role-match |
| `torre-de-controle/src/app/pages/viagens/ViagensPage.tsx` (MODIFY) | component | — | (self — wire ExportButton) | exact |
| `torre-de-controle/src/app/pages/alertas/AlertasPage.tsx` (MODIFY) | component | — | (self — wire ExportButton) | exact |
| `torre-de-controle/src/app/pages/motoristas/MotoristasPage.tsx` (MODIFY) | component | — | (self — wire ExportButton) | exact |
| `torre-de-controle/src/app/layout/AppLayout.tsx` (MODIFY) | component | — | `torre-de-controle/src/components/ui/sidebar.tsx` (SidebarProvider) | role-match |
| `torre-de-controle/src/app/router.tsx` (MODIFY) | config | — | (self — add lazy() routes) | exact |
| `torre-de-controle/src/lib/sentry.ts` | utility | config | `torre-de-controle/src/stores/useThemeStore.ts` (init pattern) | role-match |
| `torre-de-controle/src/main.tsx` (MODIFY) | config | — | (self — Sentry.init() call) | exact |
| `torre-de-controle/public/sw.js` | service-worker | event-driven | (no analog — first SW) | none — see RESEARCH Pattern 3 |
| `torre-de-controle/index.html` (MODIFY) | config | — | (self — register SW) | exact |
| `torre-de-controle/vite.config.ts` (MODIFY) | config | — | (self — add sentryVitePlugin + manualChunks) | exact |
| `torre-de-controle/.env.example` (NEW) | config | — | `api/.env.example` (env format) | role-match |

### Infra (root)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.github/workflows/ci.yml` (NEW) | config | — | `.github/workflows/main.yml` (only triage existing) | none — see RESEARCH Pattern 8 |
| `.github/workflows/deploy.yml` (NEW) | config | — | (no analog) | none — see RESEARCH Pattern 8 |
| `railway.json` (NEW, root) | config | — | (no analog) | none — see RESEARCH Pattern 6 |
| `README.md` (MODIFY) | docs | — | (self — add Deploy section) | exact |

---

## Pattern Assignments

### Backend Pattern Group A: Drizzle Schema Files

#### `api/src/db/schema/push-subscriptions.ts` (model, CRUD)

**Analog:** `api/src/db/schema/users.ts` + `api/src/db/schema/alerts.ts`

**Imports pattern** (from `users.ts` lines 1-2):
```typescript
import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
```

**Schema structure** (composite from `users.ts` lines 4-12 + `alerts.ts` lines 8-33):
```typescript
// users.ts pattern (lines 4-12)
export const users = pgTable('users', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:         varchar('name', { length: 100 }).notNull(),
  email:        varchar('email', { length: 150 }).unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  role:         varchar('role', { length: 20 }).notNull(),
  isActive:     boolean('is_active').default(true).notNull(),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// alerts.ts FK + index pattern (lines 15-33)
export const alerts = pgTable('alerts', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  // ...
  tripId:       uuid('trip_id').references(() => trips.id),
  // ...
}, (t) => ({
  statusSeverityIdx: index('idx_alerts_status_severity').on(t.status, t.severity),
}))
```

**Type exports** (lines 14-15 of `users.ts`):
```typescript
export type SelectUser = typeof users.$inferSelect
export type InsertUser = typeof users.$inferInsert
```

**Apply to `push-subscriptions.ts`:** Use `users.ts` column style + `alerts.ts` FK with `onDelete: 'cascade'` + unique constraint on endpoint (per RESEARCH.md Code Examples lines 1219-1230).

---

#### `api/src/db/schema/alert-thresholds.ts` (model, CRUD — key-value)

**Analog:** `api/src/db/schema/users.ts`

**Difference from analog:** Use `varchar` as primary key (type name as key) per RESEARCH.md lines 1234-1246 — no UUID. FK to `users` for `updatedBy`.

**Imports pattern** (RESEARCH.md lines 1234-1236):
```typescript
import { pgTable, varchar, integer, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
```

---

#### `api/src/db/schema/gps-providers.ts` (model, CRUD)

**Analog:** `api/src/db/schema/users.ts` + `api/src/db/schema/geofences.ts` (boolean isActive pattern)

**Pattern from `geofences.ts` lines 4-16:**
```typescript
export const geofences = pgTable('geofences', {
  id:          uuid('id').primaryKey().defaultRandom(),  // alternate to gen_random_uuid()
  name:        varchar('name', { length: 100 }).notNull(),
  type:        varchar('type', { length: 30 }).notNull().default('zona_restrita'),
  color:       varchar('color', { length: 20 }).notNull().default('#ef4444'),
  isActive:    boolean('is_active').notNull().default(true),
  description: text('description'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**Note on PK default:** Both `defaultRandom()` (geofences) and `default(sql\`gen_random_uuid()\`)` (users) coexist in codebase — choose `defaultRandom()` for new tables (shorter, idiomatic Drizzle).

---

#### `api/src/db/schema/users.ts` (MODIFY — add notificationPreferences)

**Self-modify** — add JSONB column with default per RESEARCH.md lines 1266-1278:
```typescript
import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  // ... existing columns
  notificationPreferences: jsonb('notification_preferences').default({ critico: true, medio: false, baixo: false }),
})
```

**Risk (A10 in RESEARCH):** drizzle-kit push may not set default on existing rows. Fallback in seed: `UPDATE users SET notification_preferences = '{"critico":true,...}' WHERE notification_preferences IS NULL`.

---

#### `api/src/db/schema/relations.ts` (MODIFY)

**Analog:** lines 60-63 of existing `relations.ts`:
```typescript
export const usersRelations = relations(users, ({ many }) => ({
  assignedAlerts: many(alerts),
  treatments:     many(treatments),
}))
```

**Add:**
```typescript
export const usersRelations = relations(users, ({ many }) => ({
  assignedAlerts:    many(alerts),
  treatments:        many(treatments),
  pushSubscriptions: many(pushSubscriptions),
}))

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, { fields: [pushSubscriptions.userId], references: [users.id] }),
}))
```

---

#### `api/src/db/schema/index.ts` (MODIFY)

**Analog:** lines 1-11 of existing `index.ts`:
```typescript
export * from './users'
export * from './clients'
// ...
export * from './relations'
```

**Add:**
```typescript
export * from './push-subscriptions'
export * from './alert-thresholds'
export * from './gps-providers'
```

---

### Backend Pattern Group B: Module Service + Plugin

#### `api/src/modules/insights/insights.service.ts` (service, aggregate-read)

**Analog:** `api/src/modules/dashboard/dashboard.service.ts`

**Imports pattern** (lines 1-5):
```typescript
import { db } from '../../db/client'
import { redis } from '../../redis/client'
import { trips } from '../../db/schema/trips'
import { alerts } from '../../db/schema/alerts'
import { drivers } from '../../db/schema/drivers'
```

**Core aggregation pattern** (lines 7-44):
```typescript
const KPI_CACHE_KEY = 'kpi:dashboard'
const KPI_CACHE_TTL = 30

export async function getDashboardKpis() {
  const cached = await redis.get(KPI_CACHE_KEY)
  if (cached) {
    try { return JSON.parse(cached) } catch { /* fall through */ }
  }

  const [allTrips, allAlerts, allDrivers] = await Promise.all([
    db.select().from(trips),
    db.select().from(alerts),
    db.select().from(drivers),
  ])

  // ... aggregation logic ...

  await redis.set(KPI_CACHE_KEY, JSON.stringify(kpis), 'EX', KPI_CACHE_TTL)
  return kpis
}
```

**SQL aggregation pattern** (use raw `sql` template for grouped queries — RESEARCH.md lines 263-281):
```typescript
import { sql } from 'drizzle-orm'

export async function getSlaHistory(range: '7d'|'30d'|'90d' = '30d') {
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
  const rows = await db.execute(sql`
    SELECT
      DATE(window_end) AS date,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE sla_status = 'no_prazo') AS on_time
    FROM trips
    WHERE status = 'completed'
      AND window_end >= NOW() - INTERVAL '1 day' * ${days}
    GROUP BY DATE(window_end)
    ORDER BY date ASC
  `) as Array<{ date: string; total: number; on_time: number }>
  return rows.map(r => ({
    date: r.date,
    total: Number(r.total),
    onTime: Number(r.on_time),
    sla: Number(r.total) ? Number(r.on_time) / Number(r.total) : 0,
  }))
}
```

**Cache key naming convention:** `kpi:insights:{endpoint}:{range}` (e.g., `kpi:insights:sla-history:30d`). TTL 30s (matches D-29 staleTime).

---

#### `api/src/modules/insights/insights.plugin.ts` (controller, request-response)

**Analog:** `api/src/modules/dashboard/dashboard.plugin.ts`

**Full file (lines 1-10):**
```typescript
import { Elysia } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getDashboardKpis } from './dashboard.service'

export const dashboardPlugin = new Elysia({ name: 'dashboard' })
  .use(authGuard)
  .group('/api/dashboard', (app) =>
    app.get('/kpis', () => getDashboardKpis(), { detail: { tags: ['dashboard'], summary: 'KPIDashboard with 30s Redis cache' } })
  )
```

**Query validation pattern** (from `trips.plugin.ts` lines 4-37):
```typescript
const slaStatus = t.Union([t.Literal('no_prazo'), t.Literal('em_risco'), t.Literal('atrasado'), t.Literal('sem_sinal')])

// ...
{
  query: t.Object({
    status:     t.Optional(tripStatus),
    page:       t.Optional(t.Numeric({ minimum: 0 })),
    limit:      t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
  }),
  detail: { tags: ['trips'], summary: 'List trips with filters' },
}
```

**Insights endpoints to expose:**
- `GET /api/insights/sla-history?range=30d`
- `GET /api/insights/drivers-ranking?range=30d&order=desc&limit=10`
- `GET /api/insights/problematic-routes?range=30d`
- `GET /api/insights/alerts-distribution?range=30d`

Range typebox: `t.Union([t.Literal('7d'), t.Literal('30d'), t.Literal('90d')])`.

---

#### `api/src/modules/exports/exports.plugin.ts` (controller, streaming-response)

**Analog:** `api/src/modules/trips/trips.plugin.ts` (for filter typebox) + RESEARCH.md Pattern 2 (lines 316-340) for streaming.

**Streaming response pattern** (RESEARCH.md lines 316-340 + Pitfall #4):
```typescript
import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { streamTripsCsv, streamAlertsCsv, streamTreatmentsCsv, streamMotoristasCsv } from './exports.service'
import { dateStamp } from './exports.csv'

export const exportsPlugin = new Elysia({ name: 'exports' })
  .use(authGuard)
  .get('/api/exports/viagens.csv', ({ query }) => {
    const filename = `viagens_${dateStamp()}.csv`
    const stream = streamTripsCsv(query)
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  }, {
    query: t.Object({
      status:     t.Optional(t.String()),
      slaStatus:  t.Optional(t.String()),
      clientName: t.Optional(t.String()),
      search:     t.Optional(t.String()),
    }),
    detail: { tags: ['exports'], summary: 'Export trips as CSV' },
  })
```

**CRITICAL (RESEARCH Pitfall #4):** Must wrap stream in `new Response(stream, { headers })`. NEVER return raw `ReadableStream` from handler.

---

#### `api/src/modules/exports/exports.service.ts` (service, streaming)

**Analog:** `api/src/modules/trips/trips.service.ts` (filter pattern lines 8-46) + RESEARCH.md lines 351-373 (stream pattern).

**Filter pattern from `trips.service.ts` lines 8-46** (reuse for CSV filter inputs):
```typescript
export type TripFilters = {
  status?:     'planned'|'in_progress'|'completed'|'delayed'|'cancelled'
  slaStatus?:  'no_prazo'|'em_risco'|'atrasado'|'sem_sinal'
  clientName?: string
  // ...
}

const conditions = []
if (filters.status)    conditions.push(eq(trips.status, filters.status))
if (filters.slaStatus) conditions.push(eq(trips.slaStatus, filters.slaStatus))
// ...
const where = conditions.length ? and(...conditions) : undefined
```

**ReadableStream pattern (RESEARCH.md lines 351-373):**
```typescript
import { trips } from '../../db/schema/trips'
import { db } from '../../db/client'
import { formatCsvRow } from './exports.csv'

const BOM = '﻿'
const HEADER = ['Código','Motorista','Cliente','Origem','Destino','Janela Início','Janela Fim','ETA','Status','SLA','Progresso %']

export function streamTripsCsv(filters: any): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(BOM + HEADER.join(';') + '\n'))
      const q = db.select().from(trips).limit(50000)  // safety cap
      for await (const row of q) {
        const line = formatCsvRow([
          row.code, row.driverId, row.clientId,
          row.origin, row.destination,
          row.windowStart?.toISOString(), row.windowEnd?.toISOString(),
          row.eta?.toISOString(), row.status, row.slaStatus, row.progressPct,
        ])
        controller.enqueue(encoder.encode(line + '\n'))
      }
      controller.close()
    },
  })
}
```

---

#### `api/src/modules/exports/exports.csv.ts` (utility, transform)

**No analog — new code per RESEARCH.md lines 295-313:**
```typescript
const BOM = '﻿'  // U+FEFF — abre correto no Excel BR

export function formatCsvRow(values: Array<string|number|null|undefined>): string {
  return values.map(v => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }).join(';')
}

export function dateStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}
```

---

#### `api/src/modules/push/push.service.ts` (service, event-driven + CRUD)

**Analog:** `api/src/modules/alerts/alerts.service.ts` (DB ops) + `auth.service.ts` (init via env vars) + RESEARCH.md lines 414-453.

**Init pattern (similar to `auth.service.ts` lines 1-7):**
```typescript
import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { users, type SelectUser } from '../../db/schema/users'
import { redis } from '../../redis/client'

const BCRYPT_COST = 10
```

**Apply to `push.service.ts` (RESEARCH.md lines 414-453):**
```typescript
import webpush from 'web-push'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { pushSubscriptions } from '../../db/schema/push-subscriptions'
import { logger } from '../../lib/logger'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export async function subscribe(userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  await db.insert(pushSubscriptions).values({
    userId,
    endpoint: subscription.endpoint,
    p256dh:   subscription.keys.p256dh,
    auth:     subscription.keys.auth,
  }).onConflictDoNothing({ target: pushSubscriptions.endpoint })
}

export async function sendToUser(userId: string, payload: { title: string; body: string; url: string }) {
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
  await Promise.allSettled(subs.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 },
      )
    } catch (e: any) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint))
      } else {
        logger.error({ error: e.message, endpoint: s.endpoint }, 'push send failed')
      }
    }
  }))
}
```

**Logger usage pattern** (from `alerts.service.ts` and inline alert-inline.ts line 115):
```typescript
logger.info({ alertId: inserted.id, type: a.type, tripId: trip.id }, 'alert created')
```

---

#### `api/src/modules/push/push.plugin.ts` (controller, request-response)

**Analog:** `api/src/modules/alerts/alerts.plugin.ts`

**Plugin structure pattern** (from `alerts.plugin.ts` lines 1-65):
```typescript
import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { subscribe, unsubscribe, getVapidPublicKey } from './push.service'

export const pushPlugin = new Elysia({ name: 'push' })
  .use(authGuard)
  .group('/api/push', (app) =>
    app
      .get('/vapid-public-key', () => ({ publicKey: process.env.VAPID_PUBLIC_KEY }))
      .post('/subscribe', async ({ body, user }) => {
        await subscribe(user.id, body)
        return { ok: true }
      }, {
        body: t.Object({
          endpoint: t.String(),
          keys: t.Object({
            p256dh: t.String(),
            auth:   t.String(),
          }),
        }),
        detail: { tags: ['push'], summary: 'Register push subscription' },
      })
      .post('/unsubscribe', async ({ body, user }) => {
        await unsubscribe(user.id, body.endpoint)
        return { ok: true }
      }, {
        body: t.Object({ endpoint: t.String() }),
        detail: { tags: ['push'], summary: 'Remove push subscription' },
      })
  )
```

---

#### `api/src/modules/users/users.service.ts` (service, CRUD)

**Analog:** `api/src/modules/auth/auth.service.ts` (bcrypt) + `api/src/modules/drivers/drivers.service.ts` (filter pattern).

**bcrypt pattern from `auth.service.ts` lines 1-22:**
```typescript
import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { users, type SelectUser } from '../../db/schema/users'

const BCRYPT_COST = 10

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST)
}
```

**CRUD list pattern from `drivers.service.ts` lines 11-30:**
```typescript
export async function listUsers() {
  const rows = await db.select().from(users).orderBy(asc(users.name))
  return rows.map(u => ({
    id:       u.id,
    name:     u.name,
    email:    u.email,
    role:     u.role,
    isActive: u.isActive,
    notificationPreferences: u.notificationPreferences,
    // NEVER expose passwordHash!
  }))
}
```

**Create + soft-delete pattern (D-18: never hard-delete):**
```typescript
export async function createUser(input: { name: string; email: string; role: string; password: string }) {
  const passwordHash = await hashPassword(input.password)
  const [u] = await db.insert(users).values({
    name: input.name, email: input.email, role: input.role, passwordHash,
  }).returning()
  return u
}

export async function deactivateUser(id: string) {
  const [u] = await db.update(users).set({ isActive: false }).where(eq(users.id, id)).returning()
  return u
}
```

---

#### `api/src/modules/users/users.plugin.ts` (controller, CRUD)

**Analog:** `api/src/modules/trips/trips.plugin.ts` (param/query/body validation) + `api/src/modules/geofences/geofences.plugin.ts` (full CRUD with PATCH/DELETE).

**RBAC pattern (CRITICAL — D-18 admin only):**

From `rbac.ts` lines 34-43:
```typescript
export function requireRole(...roles: AuthUser['role'][]) {
  return new Elysia({ name: `require-role-${roles.join('-')}` })
    .use(authGuard)
    .onBeforeHandle(({ user, set }) => {
      if (!roles.includes(user.role)) {
        set.status = 403
        throw new Error(`Forbidden: requires role ${roles.join('|')}`)
      }
    })
}
```

**Apply to `users.plugin.ts`:**
```typescript
import { Elysia, t } from 'elysia'
import { requireRole } from '../../lib/rbac'
import { listUsers, createUser, updateUser, deactivateUser } from './users.service'

export const usersPlugin = new Elysia({ name: 'users' })
  .use(requireRole('admin'))
  .group('/api/users', (app) =>
    app
      .get('/', () => listUsers(), { detail: { tags: ['users'], summary: 'List all users (admin)' } })
      .post('/', async ({ body }) => createUser(body), {
        body: t.Object({
          name:     t.String({ minLength: 1, maxLength: 100 }),
          email:    t.String({ format: 'email' }),
          role:     t.Union([t.Literal('admin'), t.Literal('supervisor'), t.Literal('analyst'), t.Literal('viewer')]),
          password: t.String({ minLength: 6 }),
        }),
        detail: { tags: ['users'], summary: 'Create user' },
      })
      .patch('/:id', async ({ params, body, set }) => {
        const r = await updateUser(params.id, body)
        if (!r) { set.status = 404; return { error: 'User not found' } }
        return r
      }, {
        params: t.Object({ id: t.String({ format: 'uuid' }) }),
        body: t.Object({
          role:     t.Optional(t.Union([t.Literal('admin'), t.Literal('supervisor'), t.Literal('analyst'), t.Literal('viewer')])),
          isActive: t.Optional(t.Boolean()),
          notificationPreferences: t.Optional(t.Any()),
        }),
      })
      .delete('/:id', async ({ params, set }) => {
        // SOFT DELETE — D-18
        const r = await deactivateUser(params.id)
        if (!r) { set.status = 404; return { error: 'User not found' } }
        set.status = 204; return ''
      }, { params: t.Object({ id: t.String({ format: 'uuid' }) }) })
  )
```

---

#### `api/src/modules/thresholds/thresholds.service.ts` (service, CRUD + in-memory cache)

**Analog:** `api/src/modules/dashboard/dashboard.service.ts` (Redis cache) — but use **in-memory** per D-19/RESEARCH.md Pattern Map.

**In-memory cache pattern (RESEARCH.md lines 1283-1313):**
```typescript
import { db } from '../../db/client'
import { alertThresholds } from '../../db/schema/alert-thresholds'

let cache: Record<string, number> | null = null
let cacheExpiry = 0
const TTL_MS = 60_000

export async function getThresholds(): Promise<Record<string, number>> {
  if (cache && Date.now() < cacheExpiry) return cache
  const rows = await db.select().from(alertThresholds)
  cache = Object.fromEntries(rows.map(r => [r.type, r.value]))
  cacheExpiry = Date.now() + TTL_MS
  return cache
}

export function invalidateThresholdsCache(): void {
  cache = null
  cacheExpiry = 0
}

export async function updateThreshold(type: string, value: number, updatedBy: string) {
  await db.insert(alertThresholds)
    .values({ type, value, updatedBy })
    .onConflictDoUpdate({
      target: alertThresholds.type,
      set:    { value, updatedBy, updatedAt: new Date() },
    })
  invalidateThresholdsCache()
}
```

---

#### `api/src/modules/thresholds/thresholds.plugin.ts` (controller, CRUD)

**Analog:** `api/src/modules/geofences/geofences.plugin.ts` (PATCH pattern lines 122-152).

**Read all + admin update pattern:**
```typescript
import { Elysia, t } from 'elysia'
import { authGuard, requireRole } from '../../lib/rbac'
import { getThresholds, updateThreshold } from './thresholds.service'

export const thresholdsPlugin = new Elysia({ name: 'thresholds' })
  .use(authGuard)
  .get('/api/thresholds', () => getThresholds(), {
    detail: { tags: ['thresholds'], summary: 'Get current alert thresholds (cached 60s)' },
  })
  .use(requireRole('admin'))
  .patch('/api/thresholds/:type', async ({ params, body, user, set }) => {
    await updateThreshold(params.type, body.value, user.id)
    set.status = 204; return ''
  }, {
    params: t.Object({ type: t.String() }),
    body: t.Object({ value: t.Integer({ minimum: 0, maximum: 10000 }) }),
    detail: { tags: ['thresholds'], summary: 'Update threshold (admin only)' },
  })
```

---

#### `api/src/modules/gps-providers/gps-providers.{service,plugin}.ts` (CRUD)

**Analog:** `api/src/modules/geofences/geofences.plugin.ts` (full CRUD example lines 76-170).

**Geofences plugin CRUD pattern (lines 90-159):**
```typescript
.post('/', async ({ body }) => {
  const [fence] = await db.insert(geofences).values({ /* ... */ }).returning()
  return fence
}, {
  body: t.Object({ name: t.String({ minLength: 1 }), /* ... */ }),
})

.patch('/:id', async ({ params, body, set }) => {
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name) updates.name = body.name
  // ...
  const [r] = await db.update(geofences).set(updates as any).where(eq(geofences.id, params.id)).returning()
  if (!r) { set.status = 404; return { error: 'Not found' } }
  return r
})

.delete('/:id', async ({ params, set }) => {
  await db.delete(geofences).where(eq(geofences.id, params.id))
  set.status = 204; return ''
})
```

Apply identical CRUD shape to `gps-providers.plugin.ts`. Protect writes with `requireRole('admin')`. Reads open to all authenticated users.

---

### Backend Pattern Group C: Integration Points

#### `api/src/modules/alerts/alerts.service.ts` (MODIFY — dispatch push)

**Self-modify** — add push hook after insert. The current code does NOT insert alerts directly (insert is in `alert-inline.ts`). Wire dispatcher there too.

**Pattern from `alert-inline.ts` lines 87-116:**
```typescript
// Insert and broadcast new alerts
for (const a of detectedAlerts) {
  const [inserted] = await db.insert(alerts).values({ /* ... */ }).returning()

  await redis.publish(ALERT_BROADCAST_CHANNEL, JSON.stringify({
    type:      'alert:new',
    alertId:   inserted.id,
    severity:  a.severity,
    alertType: a.type,
    tripId:    trip.id,
    title:     a.title,
  }))

  logger.info({ alertId: inserted.id, type: a.type, tripId: trip.id }, 'alert created')
}
```

**Add after `redis.publish(...)`:**
```typescript
import { dispatchAlertPush } from '../modules/push/push.dispatcher'

// ... after insert + publish ...
dispatchAlertPush({
  id:          inserted.id,
  title:       a.title,
  description: a.description,
  severity:    a.severity,
}).catch(e => logger.error({ error: e.message, alertId: inserted.id }, 'push dispatch failed'))
```

**Fire-and-forget pattern** matches geofence check in `api/src/index.ts` line 148:
```typescript
checkGeofences(vehicleId, lat, lng).catch(e => logger.error({ error: e.message }, 'geofence check error'))
```

---

#### `api/src/modules/push/push.dispatcher.ts` (service, event-driven)

**Analog:** `api/src/jobs/alert-inline.ts` (event-driven processor pattern).

**Dispatcher pattern (RESEARCH.md lines 455-470):**
```typescript
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { sendToUser } from './push.service'

export async function dispatchAlertPush(alert: { id: string; title: string; description: string; severity: string }) {
  // Find users with active subscription + matching severity pref
  const users = await db.execute(sql`
    SELECT id, notification_preferences FROM users
    WHERE is_active = true
      AND notification_preferences->>${alert.severity} = 'true'
  `) as Array<{ id: string }>

  await Promise.allSettled(users.map(u =>
    sendToUser(u.id, {
      title: `⚠ ${alert.title}`,
      body:  alert.description ?? '',
      url:   `/alertas/${alert.id}`,
    })
  ))
}
```

---

#### `api/src/index.ts` (MODIFY — wire plugins + Sentry init)

**Pattern (from existing lines 12-18 — plugin imports + lines 121-127 wiring):**
```typescript
import { authPlugin } from './modules/auth/auth.plugin'
import { tripsPlugin } from './modules/trips/trips.plugin'
// ...

export const app = new Elysia()
  .use(cors({ /* ... */ }))
  // ...
  .use(authPlugin)
  .use(tripsPlugin)
  .use(driversPlugin)
  .use(alertsPlugin)
  .use(vehiclesPlugin)
  .use(dashboardPlugin)
  .use(wsPlugin)
```

**Add (top of file):**
```typescript
import './lib/sentry'  // side-effect: initializes Sentry if SENTRY_DSN present
import { insightsPlugin } from './modules/insights/insights.plugin'
import { exportsPlugin } from './modules/exports/exports.plugin'
import { pushPlugin } from './modules/push/push.plugin'
import { usersPlugin } from './modules/users/users.plugin'
import { thresholdsPlugin } from './modules/thresholds/thresholds.plugin'
import { gpsProvidersPlugin } from './modules/gps-providers/gps-providers.plugin'
```

**Add to swagger tags (lines 87-96):**
```typescript
{ name: 'insights',      description: 'Aggregated analytics (Redis cache 30s)' },
{ name: 'exports',       description: 'CSV streaming exports (UTF-8 BOM, ; delim)' },
{ name: 'push',          description: 'Web Push subscriptions + delivery (VAPID)' },
{ name: 'users',         description: 'User CRUD (admin only)' },
{ name: 'thresholds',    description: 'Alert thresholds (in-memory cache 60s)' },
{ name: 'gps-providers', description: 'GPS provider config (stubs)' },
```

**Add plugin `.use()` calls (after `dashboardPlugin`):**
```typescript
.use(insightsPlugin)
.use(exportsPlugin)
.use(pushPlugin)
.use(usersPlugin)
.use(thresholdsPlugin)
.use(gpsProvidersPlugin)
```

---

#### `api/src/lib/sentry.ts` (utility, config)

**Analog:** `api/src/lib/logger.ts` (env-based init).

**Logger pattern (lines 1-14):**
```typescript
import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  // ...
  base: { service: 'torre-api' },
})
```

**Apply (RESEARCH.md lines 669-683 + Pattern 5 scrub):**
```typescript
import * as Sentry from '@sentry/bun'
import { scrubRecursive } from './scrub'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn:               process.env.SENTRY_DSN,
    environment:       process.env.NODE_ENV ?? 'development',
    tracesSampleRate:  0.1,
    beforeSend(event) { return scrubRecursive(event) },
  })
}
```

---

#### `api/src/lib/vapid.ts` (utility, config)

**Analog:** `api/src/lib/logger.ts` (env-loading pattern).

**Pattern (RESEARCH.md lines 420-424):**
```typescript
import webpush from 'web-push'
import { logger } from './logger'

const publicKey  = process.env.VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY
const subject    = process.env.VAPID_SUBJECT ?? 'mailto:admin@torredecontrole.com'

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey)
  logger.info({ subject }, 'vapid keys configured')
} else {
  logger.warn('VAPID keys missing — push notifications disabled')
}

export const isVapidConfigured = Boolean(publicKey && privateKey)
export const vapidPublicKey = publicKey
```

---

#### `api/src/db/seed/index.ts` (MODIFY — seed alert_thresholds defaults)

**Pattern from existing seed (lines 40-46 — users seed):**
```typescript
const insertedUsers = await db.insert(users).values([
  { name: 'Admin Torre', email: 'admin@torre.fic', passwordHash, role: 'admin' },
  // ...
]).returning()
console.log(`[seed] users: ${insertedUsers.length}`)
```

**Add alert_thresholds defaults (per D-19):**
```typescript
import { alertThresholds } from '../schema/alert-thresholds'

await db.insert(alertThresholds).values([
  { type: 'atraso_critico_minutes', value: 30 },
  { type: 'desvio_km_threshold',    value: 2  },
  { type: 'stop_duration_minutes',  value: 15 },
]).onConflictDoNothing()
console.log('[seed] alert_thresholds: 3 defaults')
```

---

### Frontend Pattern Group D: Hooks (TanStack Query + Eden Treaty)

#### `torre-de-controle/src/hooks/useInsights.ts` (hook, request-response)

**Analog:** `torre-de-controle/src/hooks/useDashboardKPIs.ts` lines 6-23.

**Pattern (lines 6-23):**
```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { kpisDashboard } from '@/data/mocks'
import type { KPIDashboard } from '@/data/types'

export function useDashboardKPIs() {
  const q = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: async () => {
      const { data, error } = await api.api.dashboard.kpis.get()
      if (error) return kpisDashboard
      return (data ?? kpisDashboard) as KPIDashboard
    },
    refetchInterval: 30_000,
  })
  return {
    data:      q.data ?? kpisDashboard,
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}
```

**Apply (4 sub-hooks):**
```typescript
export function useSlaHistory(range: '7d'|'30d'|'90d' = '30d') {
  const q = useQuery({
    queryKey: ['insights', 'sla-history', range],
    queryFn: async () => {
      const { data, error } = await (api.api.insights as any)['sla-history'].get({ query: { range } })
      if (error) throw new Error('Failed to fetch SLA history')
      return data
    },
    staleTime: 30_000,  // D-29
  })
  return { data: q.data ?? [], isLoading: q.isLoading, refetch: q.refetch }
}

export function useDriversRanking(range: '7d'|'30d'|'90d' = '30d') { /* same shape */ }
export function useProblematicRoutes(range: '7d'|'30d'|'90d' = '30d') { /* same shape */ }
export function useAlertsDistribution(range: '7d'|'30d'|'90d' = '30d') { /* same shape */ }
```

---

#### `torre-de-controle/src/hooks/useUsers.ts` (hook, CRUD)

**Analog:** `torre-de-controle/src/hooks/useGeofences.ts` (full CRUD with useMutation).

**Pattern (lines 1-49):**
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type Geofence = { /* ... */ }

export function useGeofences() {
  const q = useQuery({
    queryKey: ['geofences'],
    queryFn:  async () => {
      const { data, error } = await api.api.geofences.get()
      if (error) throw new Error('Failed to fetch geofences')
      return (data ?? []) as unknown as Geofence[]
    },
  })
  return { data: q.data ?? [], isLoading: q.isLoading, refetch: q.refetch }
}

export function useCreateGeofence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; /* ... */ }) => {
      const { data, error } = await (api.api.geofences as any).post(body)
      if (error) throw new Error('Create failed')
      return data as Geofence
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['geofences'] }),
  })
}

export function useDeleteGeofence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await (api.api.geofences as any)[id].delete()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['geofences'] }),
  })
}
```

**Apply identical shape to `useUsers.ts`, `useThresholds.ts`, `useGpsProviders.ts`.** Change endpoint paths + types only.

---

#### `torre-de-controle/src/hooks/useExportCsv.ts` (hook, side-effect)

**No direct analog — new pattern (RESEARCH.md lines 378-387).**

Per D-09 + Integration Points note: use `window.location.href` to leverage HttpOnly cookie automatically.

```typescript
export function useExportCsv() {
  return (entity: 'viagens'|'alertas'|'tratativas'|'motoristas', filters: Record<string, any>) => {
    const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([_, v]) => v !== undefined && v !== '')
        .reduce((acc, [k, v]) => ({ ...acc, [k]: String(v) }), {})
    ).toString()
    window.location.href = `${apiUrl}/api/exports/${entity}.csv${qs ? '?' + qs : ''}`
  }
}
```

---

#### `torre-de-controle/src/hooks/usePushSubscription.ts` (hook, side-effect)

**No analog — new pattern (RESEARCH.md lines 511-541).**

```typescript
import { useState } from 'react'
import { api } from '@/lib/api'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY!

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)))
}

export function usePushSubscription() {
  const [status, setStatus] = useState<'idle'|'enabling'|'enabled'|'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const enablePush = async () => {
    setStatus('enabling'); setError(null)
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push não suportado neste browser')
      }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Permissão negada')

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      const json = subscription.toJSON()
      const { error: apiError } = await (api.api.push as any).subscribe.post({
        endpoint: subscription.endpoint,
        keys:     json.keys,
      })
      if (apiError) throw new Error('Falha ao registrar subscription')
      setStatus('enabled')
    } catch (e: any) {
      setStatus('error'); setError(e.message)
    }
  }

  return { status, error, enablePush }
}
```

---

### Frontend Pattern Group E: Chart Components

#### `torre-de-controle/src/app/pages/insights/components/SlaHistoricoChart.tsx` (component, render)

**Analog:** `torre-de-controle/src/components/domain/SparklineChart.tsx`

**Key pattern (lines 1-58):**
```typescript
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, Filler,
} from 'chart.js'
import { useThemeStore } from '@/stores/useThemeStore'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler)

interface Props {
  data: number[]
  color?: string
  height?: number
}

export function SparklineChart({ data, color, height = 40 }: Props) {
  const { isDark } = useThemeStore()
  const lineColor = color ?? (isDark ? '#4d94ff' : '#0f62fe')
  // ...

  return (
    <div style={{ height, width: '100%', minWidth: 80 }}>
      <Line
        key={`${isDark}-${lineColor}`}  // CRITICAL: force re-mount on theme switch
        data={{ /* ... */ }}
        options={{ /* ... */ }}
      />
    </div>
  )
}
```

**Apply to `SlaHistoricoChart.tsx` (full Line chart with axes — RESEARCH.md lines 556-612):**
- Reuse `useThemeStore` for `isDark` flag
- ALWAYS use `key={\`${isDark}-...\`}` to force re-mount on theme change
- Register chart.js components at module top
- Read CSS vars for theme-aware colors:
  ```typescript
  function cssVar(name: string): string {
    if (typeof window === 'undefined') return '#000'
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000'
  }
  // Usage: borderColor: cssVar('--success')
  ```
- Add `onClick` callback for D-04 cross-filter:
  ```typescript
  onClick: (_, elements) => {
    if (elements.length && onPointClick) {
      onPointClick(labels[elements[0].index])
    }
  }
  ```

---

#### `torre-de-controle/src/app/pages/insights/components/MotoristasRankingChart.tsx` + `AlertasDistribuicaoChart.tsx`

**Apply identical SparklineChart pattern but switch `Line` → `Bar` (ranking) / `Doughnut` (distribution).** Register `BarElement` / `ArcElement`:
```typescript
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)
```

---

#### `torre-de-controle/src/app/pages/insights/components/RotasProblematicasTable.tsx`

**Analog:** `torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx` (column def pattern lines 39-88).

**Column definition pattern (lines 39-88):**
```typescript
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/domain/DataTable'

const columns: ColumnDef<RouteRanking>[] = [
  {
    id: 'route', header: 'Rota', size: 240,
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{row.original.code}</p>
        <p className="text-xs text-muted-foreground">{row.original.name}</p>
      </div>
    ),
  },
  { accessorKey: 'alerts', header: 'Alertas', cell: i => <span className="tabular-nums">{i.getValue<number>()}</span> },
  // ...
]

return <DataTable data={routes} columns={columns} pageSize={10} emptyMessage="Sem dados no período." />
```

---

### Frontend Pattern Group F: Pages

#### `torre-de-controle/src/app/pages/insights/InsightsPage.tsx` (component, request-response)

**Analog:** `torre-de-controle/src/app/pages/alertas/AlertasPage.tsx` (filter state + multi-section layout).

**Filter state + header pattern (lines 11-23):**
```typescript
import { useState } from 'react'
import type { AlertFilters } from '@/data/types'

export function AlertasPage() {
  const [filters, setFilters] = useState<AlertFilters>({ period: 'today' })
  const { data: alerts } = useAlerts(filters)
  // ...

  return (
    <div className="space-y-5">
      <header className="pb-4">
        <h1 className="text-2xl font-bold text-white">Alertas</h1>
        <p className="text-sm text-white/70">Lista priorizada e tratativas</p>
      </header>

      <AlertasKPIRow />
      <AlertasFiltersBar filters={filters} onChange={setFilters} />
      {/* ... */}
    </div>
  )
}
```

**Apply for InsightsPage with cross-filter state (D-04):**
```typescript
import { useState } from 'react'
import { DateRangePicker } from './components/DateRangePicker'
import { SlaHistoricoChart } from './components/SlaHistoricoChart'
import { MotoristasRankingChart } from './components/MotoristasRankingChart'
import { RotasProblematicasTable } from './components/RotasProblematicasTable'
import { AlertasDistribuicaoChart } from './components/AlertasDistribuicaoChart'
import { useSlaHistory, useDriversRanking, useProblematicRoutes, useAlertsDistribution } from '@/hooks/useInsights'

export function InsightsPage() {
  const [range, setRange] = useState<'7d'|'30d'|'90d'>('30d')
  const [dateFilter, setDateFilter] = useState<string | null>(null)  // D-04 cross-filter

  const { data: slaHistory } = useSlaHistory(range)
  const { data: ranking }    = useDriversRanking(range)
  const { data: routes }     = useProblematicRoutes(range)
  const { data: distribution } = useAlertsDistribution(range)

  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Insights</h1>
          <p className="text-sm text-white/70">Analytics, tendências de SLA e ranking operacional</p>
        </div>
        <div className="ml-auto"><DateRangePicker value={range} onChange={setRange} /></div>
      </header>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <SlaHistoricoChart data={slaHistory} onPointClick={setDateFilter} />
        <MotoristasRankingChart data={ranking} dateFilter={dateFilter} />
        <RotasProblematicasTable data={routes} dateFilter={dateFilter} />
        <AlertasDistribuicaoChart data={distribution} dateFilter={dateFilter} />
      </div>
    </div>
  )
}
```

---

#### `torre-de-controle/src/app/pages/configuracoes/ConfiguracoesPage.tsx` (component, request-response)

**Analog:** `torre-de-controle/src/components/ui/tabs.tsx` (shadcn Tabs).

**Tabs usage pattern (lines 7-88 + standard shadcn API):**
```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UsersTab } from './tabs/UsersTab'
import { AlertThresholdsTab } from './tabs/AlertThresholdsTab'
import { NotificationsTab } from './tabs/NotificationsTab'
import { GpsProvidersTab } from './tabs/GpsProvidersTab'

export function ConfiguracoesPage() {
  return (
    <div className="space-y-5">
      <header className="pb-4">
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-sm text-white/70">Usuários, regras de alerta e integrações</p>
      </header>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="thresholds">Alertas</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
          <TabsTrigger value="gps">Integrações GPS</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="thresholds"><AlertThresholdsTab /></TabsContent>
        <TabsContent value="notifications"><NotificationsTab /></TabsContent>
        <TabsContent value="gps"><GpsProvidersTab /></TabsContent>
      </Tabs>
    </div>
  )
}
```

---

#### `torre-de-controle/src/app/pages/configuracoes/tabs/UsersTab.tsx`

**Analog:** `torre-de-controle/src/app/pages/motoristas/components/MotoristasTable.tsx` (toolbar + columns + TableWithSidePanel).

**Reuse `<DataTable>` or `<TableWithSidePanel>` pattern:** see Frontend Group E `RotasProblematicasTable` for column def shape. For edit side panel, follow `MotoristasTable.tsx` pattern (lines 90-144).

---

### Frontend Pattern Group G: Layout + Routing

#### `torre-de-controle/src/app/layout/AppLayout.tsx` (MODIFY)

**Current pattern (lines 1-53):**
```typescript
export function AppLayout() {
  return (
    <div className="relative flex h-full" style={{ background: 'var(--app-background)' }}>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen relative overflow-x-hidden"
           style={{ marginLeft: '274px', zIndex: 1 }}>
        <Topbar />
        <main className="relative flex-1 px-6 pb-6 pt-2"><Outlet /></main>
      </div>
    </div>
  )
}
```

**REFACTOR REQUIRED (RESEARCH.md note 6):** Replace `marginLeft: '274px'` (fixed) with shadcn `SidebarProvider` + `SidebarInset`. Pattern from `components/ui/sidebar.tsx` lines 56-152 + 307-319:

```typescript
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'

export function AppLayout() {
  // ... existing useEffect logic
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />  {/* refactor AppSidebar to use Sidebar primitives */}
      <SidebarInset>
        <Topbar />
        <main className="flex-1 px-6 pb-6 pt-2"><Outlet /></main>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

**`AppSidebar.tsx` refactor** — wrap existing nav in `<Sidebar collapsible="icon">` from `sidebar.tsx` (lines 154-254). Keep existing nav items + add tooltips so labels show in icon-only state. State management already handled by `useSidebar()` context.

---

#### `torre-de-controle/src/app/router.tsx` (MODIFY — code-splitting)

**Current pattern (lines 1-36):**
```typescript
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { AuthGuard } from './AuthGuard'
import { LoginPage } from './pages/login/LoginPage'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { InsightsPage } from './pages/insights/InsightsPage'
// ... all imports eager
```

**Apply (D-26 + RESEARCH.md Pattern 9 lines 974-1017):**
```typescript
import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { AuthGuard } from './AuthGuard'
import { LoginPage } from './pages/login/LoginPage'
import { DashboardPage } from './pages/dashboard/DashboardPage'

// LAZY — heavier pages
const TorreDeControlePage = lazy(() => import('./pages/torre-de-controle/TorreDeControlePage').then(m => ({ default: m.TorreDeControlePage })))
const InsightsPage = lazy(() => import('./pages/insights/InsightsPage').then(m => ({ default: m.InsightsPage })))
const ConfiguracoesPage = lazy(() => import('./pages/configuracoes/ConfiguracoesPage').then(m => ({ default: m.ConfiguracoesPage })))
const GeofencesPage = lazy(() => import('./pages/geofences/GeofencesPage').then(m => ({ default: m.GeofencesPage })))

function L({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Carregando...</div>}>{children}</Suspense>
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AuthGuard />,
    children: [{
      element: <AppLayout />,
      children: [
        { index: true,                element: <Navigate to="/dashboard" replace /> },
        { path: 'dashboard',          element: <DashboardPage /> },
        { path: 'torre-de-controle',  element: <L><TorreDeControlePage /></L> },
        { path: 'viagens',            element: <L><ViagensPage /></L> },
        { path: 'motoristas',         element: <L><MotoristasPage /></L> },
        { path: 'geofences',          element: <L><GeofencesPage /></L> },
        { path: 'alertas',            element: <L><AlertasPage /></L> },
        { path: 'insights',           element: <L><InsightsPage /></L> },
        { path: 'configuracoes',      element: <L><ConfiguracoesPage /></L> },
      ],
    }],
  },
])
```

---

### Frontend Pattern Group H: Observability

#### `torre-de-controle/src/lib/sentry.ts` (utility, config)

**Analog:** `torre-de-controle/src/stores/useThemeStore.ts` (env-based init pattern, lines 8-17).

**Apply (RESEARCH.md lines 651-667 + Pattern 5):**
```typescript
import * as Sentry from '@sentry/react'

const SCRUB_KEYS = [
  'password', 'passwordhash', 'authorization', 'cookie', 'cookies',
  'email', 'phone', 'lat', 'lng', 'latitude', 'longitude', 'address',
  'token', 'jwt', 'access_token', 'refresh_token',
]
const MAX_DEPTH = 8

function isScrubKey(key: string): boolean {
  const k = key.toLowerCase()
  return SCRUB_KEYS.some(s => k === s || k.includes(s))
}

function scrubRecursive(obj: any, depth = 0): any {
  if (depth > MAX_DEPTH) return '<max-depth>'
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(v => scrubRecursive(v, depth + 1))
  const out: any = {}
  for (const [k, v] of Object.entries(obj)) {
    if (isScrubKey(k)) out[k] = '<scrubbed>'
    else if (typeof v === 'string' && /Bearer\s+\S+/i.test(v)) out[k] = '<scrubbed-bearer>'
    else out[k] = scrubRecursive(v, depth + 1)
  }
  return out
}

export function initSentry() {
  if (!import.meta.env.VITE_SENTRY_DSN) return
  Sentry.init({
    dsn:                      import.meta.env.VITE_SENTRY_DSN,
    environment:              import.meta.env.MODE,
    tracesSampleRate:         0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) { return scrubRecursive(event) },
  })
}
```

**`main.tsx` modification (call before createRoot):**
```typescript
import { initSentry } from './lib/sentry'

initSentry()
// existing code below
```

---

#### `torre-de-controle/vite.config.ts` (MODIFY)

**Current pattern (lines 1-13):**
```typescript
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```

**Apply (RESEARCH.md Pattern 7 lines 765-804 — Sentry vite plugin + manualChunks):**
```typescript
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    sentryVitePlugin({
      org:         process.env.SENTRY_ORG,
      project:     process.env.SENTRY_PROJECT,
      authToken:   process.env.SENTRY_AUTH_TOKEN,
      sourcemaps:  { filesToDeleteAfterUpload: ['**/*.map'] },
      disable:     !process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'chart-vendor': ['chart.js', 'react-chartjs-2'],
          'map-vendor':   ['maplibre-gl'],
          'query-vendor': ['@tanstack/react-query', '@tanstack/react-table'],
        },
      },
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```

---

### Frontend Pattern Group I: Service Worker

#### `torre-de-controle/public/sw.js` (service-worker, event-driven)

**No analog — new code (RESEARCH.md Pattern 3 Part C lines 474-507):**
```javascript
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  if (!event.data) return
  const payload = event.data.json()
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body:               payload.body,
      icon:               '/icon-192.png',
      badge:              '/icon-192.png',
      data:               { url: payload.url },
      tag:                payload.url,
      requireInteraction: true,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
```

---

#### `torre-de-controle/index.html` (MODIFY)

**Current pattern (lines 1-19):**
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
  </head>
  <body>
    <div id="root"></div>
    <script>
      var s = localStorage.getItem('theme');
      var d = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (s === 'dark' || (!s && d)) document.documentElement.classList.add('dark');
    </script>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Apply:** Change `<title>` to "Torre de Controle". SW registration goes in `usePushSubscription.ts` hook (NOT in index.html — registration is gated by user opt-in per D-13).

---

### Infra Pattern Group J: CI/CD + Deploy

#### `.github/workflows/ci.yml` (NEW)

**No analog — new code (RESEARCH.md Pattern 8 lines 813-878):**
```yaml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      backend:  ${{ steps.filter.outputs.backend }}
      frontend: ${{ steps.filter.outputs.frontend }}
    steps:
      - uses: actions/checkout@v4
      - id: filter
        uses: dorny/paths-filter@v3
        with:
          filters: |
            backend:
              - 'api/**'
            frontend:
              - 'torre-de-controle/**'

  backend:
    needs: detect
    if: needs.detect.outputs.backend == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: 1.3.13 }
      - run: cd api && bun install --frozen-lockfile
      - run: cd api && bunx tsc --noEmit
      - name: Drizzle schema preview (dry run)
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_PROD }}
        run: cd api && bunx drizzle-kit push --strict --verbose --dry-run

  frontend:
    needs: detect
    if: needs.detect.outputs.frontend == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', cache-dependency-path: torre-de-controle/package-lock.json }
      - run: cd torre-de-controle && npm ci
      - run: cd torre-de-controle && npm run lint
      - run: cd torre-de-controle && npm run build
```

---

#### `.github/workflows/deploy.yml` (NEW)

**No analog — new code (RESEARCH.md Pattern 8 lines 882-958):**
```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      backend:  ${{ steps.filter.outputs.backend }}
      frontend: ${{ steps.filter.outputs.frontend }}
    steps:
      - uses: actions/checkout@v4
      - id: filter
        uses: dorny/paths-filter@v3
        with:
          filters: |
            backend: ['api/**']
            frontend: ['torre-de-controle/**']

  deploy-backend:
    needs: detect
    if: needs.detect.outputs.backend == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: 1.3.13 }
      - run: cd api && bun install --frozen-lockfile
      - name: Drizzle push schema
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_PROD }}
        run: cd api && bunx drizzle-kit push --strict --verbose
      - name: Deploy to Railway
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          npm install -g @railway/cli
          railway up --service=${{ secrets.RAILWAY_SERVICE_ID }} --detach

  deploy-frontend:
    needs: detect
    if: needs.detect.outputs.frontend == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd torre-de-controle && npm ci
      - name: Build with Sentry source maps
        env:
          VITE_API_URL:           ${{ secrets.VITE_API_URL }}
          VITE_SENTRY_DSN:        ${{ secrets.VITE_SENTRY_DSN }}
          VITE_VAPID_PUBLIC_KEY:  ${{ secrets.VITE_VAPID_PUBLIC_KEY }}
          SENTRY_AUTH_TOKEN:      ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG:             ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT:         torre-frontend
        run: cd torre-de-controle && npm run build
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken:    ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId:   ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command:     pages deploy torre-de-controle/dist --project-name=torre-de-controle --branch=main
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

---

#### `railway.json` (NEW)

**No analog — new code (RESEARCH.md Pattern 6 lines 693-709):**
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder":      "RAILPACK",
    "buildCommand": "cd api && bun install --frozen-lockfile"
  },
  "deploy": {
    "startCommand":            "cd api && bun run src/index.ts",
    "healthcheckPath":         "/",
    "healthcheckTimeout":      30,
    "restartPolicyType":       "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

---

#### `api/.env.example` (MODIFY)

**Current pattern (lines 1-28).** Add per RESEARCH.md lines 1318-1361:
```bash
# Web Push (Phase 6) — gerar com: bunx web-push generate-vapid-keys --json
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@torredecontrole.com

# Sentry (Phase 6) — opcional em dev, obrigatório em prod
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
```

---

#### `torre-de-controle/.env.example` (NEW)

**Analog:** `api/.env.example`.

```bash
# Backend API URL
VITE_API_URL=http://localhost:3000

# Sentry (Phase 6) — opcional em dev
VITE_SENTRY_DSN=

# Web Push (Phase 6) — public key (safe to expose)
VITE_VAPID_PUBLIC_KEY=

# For build CI only (DO NOT commit values):
# SENTRY_AUTH_TOKEN=
# SENTRY_ORG=
# SENTRY_PROJECT=torre-frontend
```

---

## Shared Patterns

### Authentication Guard (Backend)
**Source:** `api/src/lib/rbac.ts` lines 7-32 (`authGuard`) + lines 34-43 (`requireRole`).
**Apply to:** All new plugins. Pattern:
```typescript
import { Elysia } from 'elysia'
import { authGuard, requireRole } from '../../lib/rbac'

// Authenticated only:
export const insightsPlugin = new Elysia({ name: 'insights' })
  .use(authGuard)
  .group('/api/insights', (app) => app.get('/...', () => ...))

// Admin only:
export const usersPlugin = new Elysia({ name: 'users' })
  .use(requireRole('admin'))
  .group('/api/users', (app) => app.get('/', () => ...))
```

Plugins requiring `requireRole('admin')`:
- `users.plugin.ts` (D-18)
- `thresholds.plugin.ts` (writes only — D-19; reads via `authGuard`)
- `gps-providers.plugin.ts` (D-20 — writes admin; reads viewer+)

Plugins requiring `authGuard` only:
- `insights.plugin.ts`
- `exports.plugin.ts`
- `push.plugin.ts`

---

### Error Handling (Backend)
**Source:** `api/src/index.ts` lines 100-107 (centralized `.onError`):
```typescript
.onError(({ code, error, set }) => {
  const msg = error instanceof Error ? error.message : String(error)
  if (code === 'VALIDATION') { set.status = 422; return { error: 'Validation error', details: msg.slice(0, 200) } }
  if (set.status === 401 || set.status === 403 || set.status === 404 || set.status === 429) return { error: msg }
  logger.error({ code, error: msg }, 'unhandled error')
  set.status = 500
  return { error: 'Internal server error' }
})
```

**Apply:** No new error handler needed — global handler covers all plugins. Per-route 404 returns follow `trips.plugin.ts` pattern (lines 40-43):
```typescript
.get('/:id', async ({ params, set }) => {
  const trip = await getTripById(params.id)
  if (!trip) { set.status = 404; return { error: 'Trip not found' } }
  return trip
}, { params: t.Object({ id: t.String({ format: 'uuid' }) }) })
```

---

### Logging (Backend)
**Source:** `api/src/lib/logger.ts` lines 1-14 + usage in `auth.plugin.ts` lines 34-37, 48.
**Apply to:** All new service/plugin files. Structured Pino with context:
```typescript
import { logger } from '../../lib/logger'

logger.info({ userId: u.id, action: 'created' }, 'user created')
logger.warn({ endpoint: s.endpoint, statusCode: e.statusCode }, 'push delivery failed')
logger.error({ error: e.message, alertId }, 'push dispatch error')
```

---

### Validation (Backend)
**Source:** `api/src/modules/trips/trips.plugin.ts` lines 4-37 (`t.Union`, `t.Literal`, `t.Optional`, `t.Numeric`, `t.String({ format: 'uuid' })`).

**Apply:** All new plugins use Elysia TypeBox `t` validation:
```typescript
import { t } from 'elysia'

// Enum:
const severity = t.Union([t.Literal('critico'), t.Literal('medio'), t.Literal('baixo')])

// UUID param:
params: t.Object({ id: t.String({ format: 'uuid' }) })

// Query with pagination:
query: t.Object({
  range: t.Optional(t.Union([t.Literal('7d'), t.Literal('30d'), t.Literal('90d')])),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
})

// Body with email:
body: t.Object({
  email:    t.String({ format: 'email' }),
  password: t.String({ minLength: 6 }),
})
```

---

### Eden Treaty + TanStack Query (Frontend)
**Source:** `torre-de-controle/src/hooks/useTrips.ts` lines 1-21.
**Apply to:** All new hooks. Pattern:
```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useX(filters?: XFilters) {
  const q = useQuery({
    queryKey: ['x', filters],
    queryFn: async () => {
      const { data, error } = await api.api.x.get({ query: (filters ?? {}) as any })
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch')
      return (data ?? []) as X[]
    },
  })
  return {
    data:      q.data ?? [],
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}
```

**Critical:** TanStack Query global `staleTime: 30_000` already set in `main.tsx` line 12 — matches D-29.

---

### Chart.js Theme Switching (Frontend)
**Source:** `torre-de-controle/src/components/domain/SparklineChart.tsx` lines 1-58.
**Apply to:** All Insights chart components.

```typescript
import { useThemeStore } from '@/stores/useThemeStore'

const { isDark } = useThemeStore()

<Line key={`${isDark}-${lineColor}`} ... />
// or
<Bar key={`${isDark}-rank`} ... />
// or
<Doughnut key={`${isDark}-dist`} ... />
```

**CRITICAL:** `key` prop forces re-mount when theme changes — Chart.js doesn't reactively pick up CSS var changes.

---

### CSS Tokens (Frontend)
**Source:** RESEARCH.md Code Context lines 162-164 + `MotoristasTable.tsx` lines 16-31 usage.

Argon oklch tokens via `var(--success)` / `var(--warning)` / `var(--danger)` in inline styles. For Chart.js (which needs concrete colors):
```typescript
function cssVar(name: string): string {
  if (typeof window === 'undefined') return '#000'
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000'
}

// Usage in chart config:
borderColor: cssVar('--success'),
backgroundColor: cssVar('--success') + '33',  // 20% alpha
```

---

### Page Header Pattern (Frontend)
**Source:** `torre-de-controle/src/app/pages/alertas/AlertasPage.tsx` lines 19-24 (consistent across all pages).
```typescript
<header className="pb-4">
  <h1 className="text-2xl font-bold text-white">{title}</h1>
  <p className="text-sm text-white/70">{subtitle}</p>
</header>
```

Use identical header in `InsightsPage` and `ConfiguracoesPage` (replace current stubs).

---

### Hook Contract (Frontend)
**Source:** `torre-de-controle/src/hooks/useTrips.ts` lines 14-20 (consistent across all hooks).
```typescript
return {
  data:      q.data ?? defaultValue,
  isLoading: q.isLoading,
  isError:   q.isError,
  error:     q.error,
  refetch:   q.refetch,
}
```

**Apply:** All new hooks (`useInsights`, `useUsers`, `useThresholds`, `useGpsProviders`).

---

## No Analog Found

Files with no close codebase match — use RESEARCH.md patterns:

| File | Role | Data Flow | Reason | Source to Use |
|------|------|-----------|--------|---------------|
| `api/src/modules/exports/exports.csv.ts` | utility | transform | First CSV utility | RESEARCH Pattern 2 (lines 295-313) |
| `torre-de-controle/src/hooks/usePushSubscription.ts` | hook | side-effect | First SW + PushManager integration | RESEARCH Pattern 3 Part D (lines 511-541) |
| `torre-de-controle/public/sw.js` | service-worker | event-driven | First Service Worker | RESEARCH Pattern 3 Part C (lines 474-507) |
| `torre-de-controle/src/app/pages/configuracoes/tabs/AlertThresholdsTab.tsx` | component | form-submit | First RHF + Zod form | RESEARCH Pattern 10 (lines 1023-1071) |
| `torre-de-controle/src/app/pages/configuracoes/tabs/NotificationsTab.tsx` | component | form-submit | First Push opt-in UI | RESEARCH Pattern 3 (combined frontend usage of `usePushSubscription` hook) |
| `.github/workflows/ci.yml` | config | — | First CI workflow | RESEARCH Pattern 8 (lines 813-878) |
| `.github/workflows/deploy.yml` | config | — | First deploy workflow | RESEARCH Pattern 8 (lines 882-958) |
| `railway.json` | config | — | First Railway config | RESEARCH Pattern 6 (lines 693-709) |

---

## Metadata

**Analog search scope:**
- `api/src/db/schema/` (10 files scanned)
- `api/src/modules/` (8 modules scanned: auth, trips, drivers, alerts, vehicles, dashboard, telemetry, ws, geofences)
- `api/src/lib/` (rbac, jwt, logger scanned)
- `api/src/jobs/` (alert-inline, alert-queue scanned)
- `torre-de-controle/src/hooks/` (8 hooks scanned)
- `torre-de-controle/src/components/domain/` (charts, tables, layouts scanned)
- `torre-de-controle/src/components/ui/` (sidebar, tabs, table scanned)
- `torre-de-controle/src/app/pages/` (7 page directories scanned)
- `torre-de-controle/src/app/layout/` (AppLayout, AppSidebar, Topbar scanned)

**Files scanned:** ~50 (read non-redundantly, targeted ranges)

**Pattern extraction date:** 2026-05-28

**Key patterns confirmed:**
- Backend: Service + Plugin module pattern with `authGuard`/`requireRole` chain
- Drizzle: `pgTable` + `$inferSelect`/`$inferInsert` type exports + `relations()` mapping
- Frontend hooks: useQuery + useMutation + `qc.invalidateQueries()` invalidation
- Chart.js: `key={isDark}` force re-mount + CSS var theme tokens
- Layout: Current `marginLeft: '274px'` requires refactor to `SidebarProvider` (D-22)
- Routing: All routes eager — refactor to `React.lazy()` per D-26
- Auth: HttpOnly cookie + Eden Treaty `credentials: 'include'` (already configured)
- Validation: TypeBox (`t.*`) on backend + Zod planned for frontend forms
- Logging: Pino structured `logger.info({ context }, 'message')` style
- Stream: MUST wrap `ReadableStream` in `new Response(stream, { headers })` (RESEARCH Pitfall #4)
- Error: Centralized in `api/src/index.ts` `.onError` — no per-plugin error handler

---

*Phase: 06-insights-polish-deploy*
*Pattern mapper: gsd-pattern-mapper (Opus 4.7)*
*Next step: gsd-planner consumes this PATTERNS.md + 06-CONTEXT.md + 06-RESEARCH.md → produz N×PLAN.md files.*
