# Phase 6: Insights + Polish + Deploy — Research

**Researched:** 2026-05-28
**Domain:** Frontend analytics (Chart.js), CSV streaming (Elysia/Bun), Web Push (VAPID), shadcn forms, Railway+Cloudflare Pages deploy, GitHub Actions CI/CD, Sentry observability, Lighthouse perf
**Confidence:** HIGH (stack/deploy/observability) — MEDIUM (drizzle-kit push CI safety, edge cases em SW prod)

## Summary

Phase 6 é a fase de "fechamento do MVP". Stack já está 95% decidida pela CONTEXT.md — pesquisa foca em **COMO** implementar cada decisão locked, não em **SE** usar. Os pontos críticos identificados:

1. **web-push@3.6.7** (lib do D-11) FUNCIONA em Bun — Bun implementa `crypto.createECDH` via BoringSSL. Não precisa de fork ou alternativa. **[VERIFIED: bun.com/reference/node/crypto]**
2. **CSV streaming** (D-09): Bug crítico Elysia #1741 (ReadableStream direto = 100% CPU) **resolvido em 1.4.28** (versão já pinada no projeto). Padrão correto: retornar `new Response(stream, { headers })`, NÃO retornar o stream cru.
3. **drizzle-kit push automático** (D-37) é **MUITO PERIGOSO** — incidente público 2026-02 onde agente CC limpou DB de produção via push. Mitigação obrigatória: rodar `drizzle-kit push --strict --verbose` em PR (preview SQL) + nunca `--force` em CI.
4. **`cloudflare/pages-action` está DEPRECATED** — usar `cloudflare/wrangler-action@v3` com `command: pages deploy dist --project-name=...`.
5. **Railway WebSocket** tem timeout máximo de 15min — Phase 3 WS já faz reconnect, OK.
6. **Sidebar colapsável (D-22)** requer **refactor do AppLayout atual** (que usa marginLeft fixo) para `<SidebarProvider>` da shadcn — o componente `sidebar.tsx` já está instalado e suporta `state: expanded|collapsed` nativamente.
7. **shadcn `form.tsx` NÃO está instalado** — Configurações precisa adicionar via `npx shadcn@latest add form` + `react-hook-form@7.76.1` + `zod@4.4.3`.

**Primary recommendation:** Executar Phase 6 em 4 ondas: (W0) infra/schema/forms scaffold; (W1) backend modules (insights/exports/push/users/thresholds/gps-providers); (W2) frontend pages (InsightsPage cards + Configurações tabs + export buttons); (W3) deploy + Sentry + Lighthouse + docs. Bloquear merge se Lighthouse < 80 vira **warning** (D-28 explícito: não bloquear).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Insights aggregations | API (Elysia + Drizzle SQL) | — | Agregação SQL é trabalho do DB, frontend só renderiza JSON |
| Chart rendering | Browser (Chart.js via react-chartjs-2) | — | WebGL/Canvas é client-side |
| Cross-filter drill-down | Browser (React useState) | — | UI state, não compartilhar via URL globalmente (D-04 trade-off) |
| CSV export | API (Elysia stream) | — | Browser não tem acesso a query DB |
| CSV download trigger | Browser (`window.location.href`) | — | Cookie HttpOnly precisa do browser; fetch+Blob é workaround feio |
| Web Push subscription | Browser (Service Worker + PushManager) | API (persist endpoint) | SW registration é browser-only; backend só guarda subscription |
| Web Push delivery | API (web-push send) | — | Lib `web-push` faz handshake VAPID com push service |
| Web Push reception | Browser (Service Worker `push` event) | — | SW é o único contexto que recebe push em background |
| RBAC enforcement | API (authGuard + requireRole) | — | Frontend NUNCA decide permissão; só esconde UI por UX |
| Form validation | Browser (react-hook-form + zod) | API (TypeBox) | RHF para UX; TypeBox para segurança — defense in depth |
| Thresholds runtime fetch | API (in-memory cache 60s) | — | Alert engine lê thresholds; cache evita hit DB a cada posição |
| Source maps | Build (Vite + Sentry plugin) | — | Geração no build, upload CI |
| Error capture frontend | Browser (@sentry/react) | — | React ErrorBoundary + window.onerror |
| Error capture backend | API (@sentry/bun) | — | Process-level handlers |
| Sidebar collapse | Browser (shadcn SidebarProvider context) | — | UI state, cookie de persistência |

## Standard Stack

### Core (novas dependências necessárias)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `web-push` | 3.6.7 | VAPID + envio de push notifications | Lib oficial do `web-push-libs` org. Funciona em Bun (usa node:crypto.createECDH que Bun implementa via BoringSSL). Zero vendor lock. **[VERIFIED: npm view web-push version + bun.com/reference/node/crypto]** |
| `@sentry/react` | 10.55.0 | Error tracking frontend | SDK oficial Sentry. React ErrorBoundary integration. **[VERIFIED: npm registry 2026-05-28]** |
| `@sentry/bun` | 10.55.0 | Error tracking backend | SDK oficial Sentry para Bun (beta há tempo, estável). **[VERIFIED: npm registry 2026-05-28]** |
| `@sentry/vite-plugin` | latest | Source maps upload no build | Plugin oficial integrado ao Vite. **[VERIFIED: docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite]** |
| `react-hook-form` | 7.76.1 | Forms na página Configurações | Padrão de mercado. Uncontrolled inputs = perf. **[VERIFIED: npm registry 2026-05-23]** |
| `zod` | 4.4.3 | Schema validation (forms) | Pareado com RHF via `zodResolver`. **[VERIFIED: npm registry 2026-05-04]** |
| `@hookform/resolvers` | latest | Adapter zod → RHF | Padrão. Tag `[ASSUMED]` versão; npm view confirmará. |

### Supporting (dev / CI)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `wrangler` | 4.95.0 | Cloudflare Pages CLI deploy | Usado em GH Actions via `cloudflare/wrangler-action@v3`. **[VERIFIED: npm 2026-05-26]** |
| `@railway/cli` | 4.65.0 | Railway deploy CLI | Instalar no step ou usar imagem Docker `railwayapp/cli`. **[VERIFIED: npm 2026-05-27]** |
| `@sentry/cli` | 3.4.3 | Upload source maps standalone | Backup para `@sentry/vite-plugin`. **[VERIFIED: npm 2026-05-21]** |
| `@lhci/cli` | 0.15.1 | Lighthouse CI runner | Usado no workflow GH como `lhci autorun`. **[VERIFIED: npm registry]** |
| `dorny/paths-filter@v3` | v3 | Monorepo path filtering | Detecta se mudança foi em `api/**` ou `torre-de-controle/**`. |
| `oven-sh/setup-bun@v2` | v2 | Bun runtime no GH Actions | Provisiona Bun + cache. **[ASSUMED v2 é estável; v1 também existe]** |

### Alternativas consideradas e RECUSADAS

| Instead of | Could Use | Tradeoff (por que NÃO) |
|------------|-----------|------------------------|
| `web-push` | `@block65/webcrypto-web-push` | Web Crypto API puro, mais novo. **NÃO usar:** lib tradicional `web-push` funciona em Bun (verificado), adicionar lib menos conhecida = risco. |
| `web-push` | `pushforge` / `@pushforge/builder` | Zero-dep, multi-runtime. **NÃO usar:** menos battle-tested. |
| `cloudflare/pages-action@v1` | `cloudflare/wrangler-action@v3` | **OBRIGATÓRIO mudar:** pages-action está DEPRECATED 2024. **[VERIFIED: github.com/cloudflare/pages-action README]** |
| `vite-plugin-pwa` (auto SW) | SW manual em `public/sw.js` | **NÃO usar plugin:** D-12 fixa SW em `public/sw.js`. Plugin adiciona complexidade (workbox, cache strategies) que MVP não precisa. Manual = controle total para push handler. |
| `BullMQ` para CSV | Streaming síncrono | D-09 locked. BullMQ deferred. |
| RHF `Controller` | shadcn `<Form>` + `<FormField>` | **shadcn é wrapper sobre RHF** — usar o wrapper (`form.tsx`), não Controller direto. |

**Installation (backend):**
```bash
docker compose exec api bun add web-push @sentry/bun
docker compose exec api bun add -d @types/web-push
```

**Installation (frontend):**
```bash
cd torre-de-controle
npm install @sentry/react react-hook-form zod @hookform/resolvers
npm install -D @sentry/vite-plugin
npx shadcn@latest add form  # adiciona form.tsx + dependências
```

**Version verification command (executar antes do plan):**
```bash
npm view web-push version @sentry/bun version @sentry/react version react-hook-form version zod version wrangler version @lhci/cli version
```

## Architecture Patterns

### System Architecture Diagram

```
                            ┌──────────────────────────┐
                            │   Cloudflare Pages       │
                            │   (Frontend SPA)         │
                            │   torre.{domain}.com     │
                            │                          │
                            │   - React 18 + Vite 5    │
                            │   - Chart.js (Insights)  │
                            │   - SW /sw.js (Push)     │
                            │   - @sentry/react        │
                            └────────┬─────────────────┘
                                     │ HTTPS/WSS
                                     │ (cookies)
                                     ▼
┌────────────────────────────────────────────────────────────────┐
│                       Railway Network                            │
│   ┌─────────────────────┐  ┌──────────────┐  ┌─────────────┐  │
│   │  Bun + Elysia API   │  │  PostgreSQL  │  │   Redis 7   │  │
│   │  api.{domain}.com   │◄─┤  + PostGIS   │  │             │  │
│   │                     │  └──────────────┘  └─────────────┘  │
│   │  Modules:           │                                       │
│   │   /api/insights/*   │                                       │
│   │   /api/exports/*    │ ─── ReadableStream CSV               │
│   │   /api/push/*       │ ─── web-push.sendNotification ───┐   │
│   │   /api/users/*      │                                  │   │
│   │   /api/thresholds/* │                                  │   │
│   │   /api/gps-prov/*   │                                  │   │
│   │   /api/alerts/*     │ ─── hook após persist ───────────┘   │
│   │   + @sentry/bun     │                                       │
│   └──────────┬──────────┘                                       │
│              │                                                   │
└──────────────┼──────────────────────────────────────────────────┘
               │
               ▼ (HTTPS POST)
        ┌──────────────────┐
        │  Push Services   │  (FCM, Mozilla autopush, Apple)
        │  (endpoints from │
        │  SW subscribe)   │
        └─────────┬────────┘
                  │
                  ▼ (Web Push protocol)
        Browser Service Worker (sw.js)
        → showNotification(title, body)
        → on click: clients.openWindow(url)


CI/CD FLOW (GitHub Actions):
    Push to main
        │
        ├─► dorny/paths-filter@v3
        │      ├─ api/** changed?
        │      └─ torre-de-controle/** changed?
        │
        ├─► [if backend] drizzle-kit push --strict (DRY-RUN review in PR)
        │   → railway up --service=$RAILWAY_SERVICE_ID
        │   → Sentry CLI upload backend source maps
        │
        └─► [if frontend] bun/npm run build (with VITE_API_URL, VITE_SENTRY_DSN)
            → @sentry/vite-plugin uploads source maps during build
            → cloudflare/wrangler-action@v3 → pages deploy dist
```

### Recommended Project Structure

**Backend (`api/src/`):**
```
api/src/
├── modules/
│   ├── insights/
│   │   ├── insights.service.ts      # aggregation SQL (4 queries)
│   │   └── insights.plugin.ts       # Elysia router + TypeBox
│   ├── exports/
│   │   ├── exports.service.ts       # streamTripsCsv, streamAlertsCsv...
│   │   ├── exports.csv.ts           # formatCsvRow, BOM, escape
│   │   └── exports.plugin.ts        # 4 endpoints CSV
│   ├── push/
│   │   ├── push.service.ts          # subscribe/unsubscribe/sendToUser
│   │   ├── push.dispatcher.ts       # hook chamado pelo alert engine
│   │   └── push.plugin.ts           # /api/push/subscribe + /vapid-public-key
│   ├── users/
│   │   ├── users.service.ts         # CRUD (admin only)
│   │   └── users.plugin.ts          # requireRole('admin')
│   ├── thresholds/
│   │   ├── thresholds.service.ts    # get/update + in-memory cache 60s
│   │   └── thresholds.plugin.ts     # admin write, all read
│   └── gps-providers/
│       ├── gps-providers.service.ts # CRUD stub
│       └── gps-providers.plugin.ts
├── db/schema/
│   ├── push-subscriptions.ts        # NOVA: user_id, endpoint, keys
│   ├── alert-thresholds.ts          # NOVA: type, value, updated_at, updated_by
│   ├── gps-providers.ts             # NOVA: name, base_url, api_key, is_active
│   └── (existentes)
└── lib/
    └── sentry.ts                     # init @sentry/bun + beforeSend
```

**Frontend (`torre-de-controle/`):**
```
torre-de-controle/
├── public/
│   ├── sw.js                          # Service Worker (push + notificationclick)
│   ├── icon-192.png                   # ícone para notification.icon
│   ├── icon-512.png                   # ícone PWA / badge
│   └── _redirects                     # /* /index.html 200 (SPA fallback)
├── src/
│   ├── app/pages/
│   │   ├── insights/
│   │   │   ├── InsightsPage.tsx       # cross-filter state + 4 cards
│   │   │   └── components/
│   │   │       ├── DateRangePicker.tsx
│   │   │       ├── SlaHistoricoChart.tsx
│   │   │       ├── MotoristasRankingChart.tsx
│   │   │       ├── RotasProblematicasTable.tsx
│   │   │       └── AlertasDistribuicaoChart.tsx
│   │   └── configuracoes/
│   │       ├── ConfiguracoesPage.tsx  # 4 tabs (shadcn Tabs)
│   │       └── tabs/
│   │           ├── UsersTab.tsx       # CRUD usuários (admin)
│   │           ├── ThresholdsTab.tsx  # form thresholds
│   │           ├── NotificationsTab.tsx # opt-in + prefs
│   │           └── GpsProvidersTab.tsx # CRUD stub
│   ├── hooks/
│   │   ├── useInsights.ts             # 4 sub-hooks (sla/ranking/routes/dist)
│   │   ├── useExportCsv.ts            # gera URL com filtros, retorna trigger
│   │   ├── usePushSubscription.ts     # register SW + subscribe + persist
│   │   ├── useUsers.ts                # CRUD
│   │   ├── useThresholds.ts
│   │   └── useGpsProviders.ts
│   ├── components/
│   │   ├── ui/
│   │   │   └── form.tsx               # NOVO: shadcn form (RHF wrapper)
│   │   └── ExportCsvButton.tsx        # botão genérico reutilizado em 4 páginas
│   └── lib/
│       └── sentry.ts                   # init @sentry/react + beforeSend
├── .env.example                        # VITE_API_URL + VITE_SENTRY_DSN + VAPID_PUBLIC
└── vite.config.ts                      # + sentryVitePlugin + manualChunks
```

**Repo root:**
```
.github/
└── workflows/
    ├── ci.yml                          # PR: lint+typecheck+build+lighthouse (warn)
    └── deploy.yml                      # main: paths-filter → backend/frontend deploys
railway.json                            # builder: RAILPACK + start command
torre-de-controle/wrangler.toml         # (opcional — config via CLI também funciona)
```

### Pattern 1: Insights Aggregation SQL

**What:** Cada endpoint `/api/insights/*` retorna JSON agregado direto do DB, **uma query por endpoint** (evita N+1).

**When to use:** Sempre que precisar de série temporal ou ranking sobre tabela operacional grande.

**Example (SLA histórico — adapt to Drizzle):**
```typescript
// api/src/modules/insights/insights.service.ts
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'

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

**Sources:** Drizzle ORM docs + existing pattern em `alerts.service.ts` (uso de `sql` template para raw SQL).

### Pattern 2: CSV Streaming via Elysia ReadableStream

**What:** Retornar `new Response(stream, { headers })` — NÃO o stream cru. Bug Elysia #1741 (100% CPU) está fixed em 1.4.28, mas o padrão Response é mais robusto.

**When to use:** Datasets >5k linhas onde memory matters. Aceita `limit=50000` máximo.

**Example:**
```typescript
// api/src/modules/exports/exports.csv.ts
const BOM = '﻿'  // U+FEFF — abre correto no Excel BR

export function formatCsvRow(values: Array<string|number|null|undefined>): string {
  return values.map(v => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    // Escape: contém ; " ou \n → wrap em "..." e escapar " → ""
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

// api/src/modules/exports/exports.plugin.ts
import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { streamTripsCsv } from './exports.service'
import { dateStamp } from './exports.csv'

export const exportsPlugin = new Elysia({ name: 'exports' })
  .use(authGuard)
  .get('/api/exports/viagens.csv', ({ query }) => {
    const filename = `viagens_${dateStamp()}.csv`
    const stream = streamTripsCsv(query)  // returns ReadableStream
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

// api/src/modules/exports/exports.service.ts
import { trips } from '../../db/schema/trips'
import { db } from '../../db/client'
import { formatCsvRow } from './exports.csv'

const BOM = '﻿'
const HEADER = ['Código','Motorista','Cliente','Origem','Destino','Janela Início','Janela Fim','ETA','Status','SLA','Progresso %']

export function streamTripsCsv(filters: any): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      // BOM + header em chunk único
      controller.enqueue(encoder.encode(BOM + HEADER.join(';') + '\n'))

      // Drizzle iterator — postgres-js driver suporta async iterator
      const q = db.select().from(trips).limit(50000)  // safety cap
      // Aplicar filters aqui (omitido para brevidade — usar pattern de trips.service.ts)
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

**Frontend trigger (D-09 — usa window.location, NÃO fetch):**
```typescript
// torre-de-controle/src/components/ExportCsvButton.tsx
export function ExportCsvButton({ entity, filters }: { entity: 'viagens'|'alertas'|'tratativas'|'motoristas', filters: Record<string, any> }) {
  const handleClick = () => {
    const apiUrl = import.meta.env.VITE_API_URL
    const qs = new URLSearchParams(filters as any).toString()
    // Browser segura cookie HttpOnly automaticamente, faz download
    window.location.href = `${apiUrl}/api/exports/${entity}.csv${qs ? '?' + qs : ''}`
  }
  return <Button variant="outline" onClick={handleClick}>Exportar CSV</Button>
}
```

**Sources:**
- Elysia issue [#1741](https://github.com/elysiajs/elysia/issues/1741) — fixed em 1.4.28
- [Bun ReadableStream docs](https://bun.sh/guides/binary/typedarray-to-readablestream)
- Drizzle [iterator pattern](https://orm.drizzle.team/docs/select)

### Pattern 3: Web Push (VAPID + Service Worker + Backend)

**Setup (3 partes integradas):**

**Parte A — Gerar VAPID keys (uma vez, persistir em env):**
```bash
# Gerar localmente:
docker compose exec api bunx web-push generate-vapid-keys --json
# Output: { "publicKey": "BL...", "privateKey": "..." }
# Persistir em Railway env:
#   VAPID_PUBLIC_KEY=BL...
#   VAPID_PRIVATE_KEY=...
#   VAPID_SUBJECT=mailto:admin@torredecontrole.com
```

**CRITICAL:** Uma vez gerado e usado para subscriptions, NÃO regenerar — invalida TODAS subscriptions existentes.

**Parte B — Backend (api/src/modules/push/):**
```typescript
// push.service.ts
import webpush from 'web-push'
import { db } from '../../db/client'
import { pushSubscriptions } from '../../db/schema/push-subscriptions'
import { eq, and } from 'drizzle-orm'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export async function subscribe(userId: string, subscription: webpush.PushSubscription) {
  await db.insert(pushSubscriptions).values({
    userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
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
      // 410 Gone = subscription expirada → deletar
      if (e.statusCode === 410 || e.statusCode === 404) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint))
      } else {
        // log e Sentry capture
      }
    }
  }))
}

// push.dispatcher.ts (chamado pelo alert engine)
export async function dispatchAlertPush(alert: { id: string; title: string; description: string; severity: string }) {
  // Buscar todos usuários com prefs compatíveis (severity)
  const users = await db.execute(sql`
    SELECT id, notification_preferences FROM users
    WHERE is_active = true
      AND notification_preferences->>${alert.severity} = 'true'
  `)
  await Promise.allSettled(users.map(u =>
    sendToUser(u.id, {
      title: `⚠ ${alert.title}`,
      body: alert.description,
      url: `/alertas/${alert.id}`,
    })
  ))
}
```

**Parte C — Service Worker (`public/sw.js`):**
```javascript
// public/sw.js
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  if (!event.data) return
  const payload = event.data.json()
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload.url },
      tag: payload.url,        // dedupe — mesma URL substitui
      requireInteraction: true, // não auto-dismiss
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Reaproveita janela existente se houver
      for (const client of clients) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
```

**Parte D — Frontend subscribe flow:**
```typescript
// hooks/usePushSubscription.ts
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY!

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)))
}

export async function enablePush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications não suportadas neste browser')
  }
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Permissão negada')

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })

  const { error } = await api.api.push.subscribe.post({
    endpoint: subscription.endpoint,
    keys: subscription.toJSON().keys,
  })
  if (error) throw new Error('Falha ao registrar subscription')
}
```

**Sources:**
- [web-push npm](https://www.npmjs.com/package/web-push)
- [MDN ServiceWorkerRegistration.pushManager](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/pushManager)
- [MDN showNotification](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification)
- Bun crypto.createECDH support [VERIFIED]

### Pattern 4: Chart.js 4 + React 18 + Theme Switching (replica Phase 1b)

**What:** Reusar pattern `key={isDark}` para force re-mount no theme switch. Cores via `getComputedStyle` para ler `oklch(...)` do Tailwind v4.

**Example (SLA histórico — Line chart):**
```typescript
// torre-de-controle/src/app/pages/insights/components/SlaHistoricoChart.tsx
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js'
import { useThemeStore } from '@/stores/useThemeStore'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

type Point = { date: string; sla: number; total: number; onTime: number }

interface Props {
  data: Point[]
  onPointClick?: (date: string) => void  // cross-filter D-04
}

// Helper para ler oklch do CSS var (Tailwind v4 não dá hex)
function cssVar(name: string): string {
  if (typeof window === 'undefined') return '#000'
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000'
}

export function SlaHistoricoChart({ data, onPointClick }: Props) {
  const { isDark } = useThemeStore()

  const labels = data.map(d => d.date)
  const slaPercent = data.map(d => d.sla * 100)

  return (
    <Line
      key={`${isDark}-sla`}
      data={{
        labels,
        datasets: [{
          label: 'SLA %',
          data: slaPercent,
          borderColor: cssVar('--success'),
          backgroundColor: cssVar('--success') + '33',  // 20% alpha hex
          tension: 0.3,
          fill: true,
        }],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_, elements) => {
          if (elements.length && onPointClick) {
            onPointClick(labels[elements[0].index])
          }
        },
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { color: isDark ? '#fff' : '#000' } },
          x: { ticks: { color: isDark ? '#fff' : '#000' } },
        },
      }}
    />
  )
}
```

**IMPORTANT (D-04 cross-filter):** Estado de filtro vive em `InsightsPage` via `useState<{ date?: string }>`. Cada card recebe filtro como prop e dispara `onPointClick`/`onBarClick` → `setFilter()`. Sem URL persistence no MVP (Claude's discretion).

### Pattern 5: Sentry beforeSend Recursive PII Scrubbing

**What:** Walk recursivo do event object, scrub por key match (case-insensitive) substituindo por `<scrubbed>`.

**Example (compartilhável frontend + backend):**
```typescript
// scrub.ts (lib compartilhada)
const SCRUB_KEYS = [
  'password', 'passwordhash', 'authorization', 'cookie', 'cookies',
  'email', 'phone', 'lat', 'lng', 'latitude', 'longitude', 'address',
  'token', 'jwt', 'access_token', 'refresh_token',
]

const MAX_DEPTH = 8  // proteção contra circular refs / DoS

function isScrubKey(key: string): boolean {
  const k = key.toLowerCase()
  return SCRUB_KEYS.some(s => k === s || k.includes(s))
}

export function scrubRecursive(obj: any, depth = 0): any {
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

// frontend: torre-de-controle/src/lib/sentry.ts
import * as Sentry from '@sentry/react'
import { scrubRecursive } from './scrub'

export function initSentry() {
  if (!import.meta.env.VITE_SENTRY_DSN) return
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      return scrubRecursive(event)
    },
  })
}

// backend: api/src/lib/sentry.ts
import * as Sentry from '@sentry/bun'
import { scrubRecursive } from './scrub'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
    beforeSend(event) {
      return scrubRecursive(event)
    },
  })
}
```

**Important:** Sentry docs explicitamente recomendam beforeSend (não Advanced Data Scrubbing server-side rules) para garantir que PII **nunca sai do environment local**.

**Sources:**
- [Sentry JavaScript data management](https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/)
- [Sentry develop docs — Data Scrubbing](https://develop.sentry.dev/sdk/expected-features/data-handling/)

### Pattern 6: Railway Deployment (Bun + Elysia + Postgres + Redis)

**railway.json (versionado no repo, root):**
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "RAILPACK",
    "buildCommand": "cd api && bun install --frozen-lockfile"
  },
  "deploy": {
    "startCommand": "cd api && bun run src/index.ts",
    "healthcheckPath": "/",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

**Railway env vars (via dashboard ou CLI):**
```
DATABASE_URL          # automático do plugin PostgreSQL Railway
REDIS_URL             # automático do plugin Redis Railway
JWT_SECRET            # gerar com: openssl rand -hex 32
JWT_EXPIRES_IN=24h
NODE_ENV=production
PORT=3000             # Railway injeta automaticamente; respeitar
FRONTEND_URL          # https://torre.{dominio}.pages.dev
LOG_LEVEL=info
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT         # mailto:admin@dominio.com
SENTRY_DSN
SENTRY_ENVIRONMENT=production
TELEMETRY_API_KEY     # rotacionar do dev key
```

**Railpack > Nixpacks:** Em 2025/2026 Railway transicionou para Railpack como builder padrão. Para Bun melhor suporte, configurar explicitamente `"builder": "RAILPACK"`.

**Sources:**
- [bun.com Railway guide](https://bun.com/docs/guides/deployment/railway)
- [Railway Builds docs](https://docs.railway.com/builds/build-configuration)
- WebSocket: Railway suporta nativamente, **timeout 15min** — frontend já tem reconnect.

### Pattern 7: Cloudflare Pages Deployment (Vite SPA)

**`torre-de-controle/public/_redirects`:**
```
/* /index.html 200
```

**ALERTA:** Pesquisa indica que CF Pages auto-detecta SPA quando não há `404.html` na raiz do build — pode dispensar `_redirects`. Mas **adicionar para robustez** é seguro (custo zero).

**GitHub Actions deploy step:**
```yaml
- name: Deploy to Cloudflare Pages
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    command: pages deploy torre-de-controle/dist --project-name=torre-de-controle --branch=main
    gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

**Build env vars (CF Pages dashboard, OU via env: no GH step):**
```
VITE_API_URL=https://api.{dominio}.railway.app
VITE_SENTRY_DSN=https://...@sentry.io/...
VITE_VAPID_PUBLIC_KEY=BL...
```

**`vite.config.ts` (atualizar):**
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
    // Sentry plugin DEVE ser por último
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        filesToDeleteAfterUpload: ['**/*.map'],  // CRITICAL: não deixar .map em prod
      },
      disable: !process.env.SENTRY_AUTH_TOKEN,  // skip em dev
    }),
  ],
  build: {
    sourcemap: 'hidden',  // gera mas não referencia (Sentry plugin lê)
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor split — explícito para perf Lighthouse
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'chart-vendor': ['chart.js', 'react-chartjs-2'],
          'map-vendor': ['maplibre-gl'],  // dynamic import já isola, mas reforço
          'query-vendor': ['@tanstack/react-query', '@tanstack/react-table'],
        },
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

**Sources:**
- [cloudflare/wrangler-action README](https://github.com/cloudflare/wrangler-action)
- [Sentry Vite plugin docs](https://www.npmjs.com/package/@sentry/vite-plugin)

### Pattern 8: GitHub Actions Monorepo CI/CD

**`.github/workflows/ci.yml` (PR — lint+typecheck+build):**
```yaml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      backend: ${{ steps.filter.outputs.backend }}
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
      # Schema dry-run: gera SQL sem aplicar (safety)
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

  lighthouse:
    needs: frontend
    if: needs.detect.outputs.frontend == 'true'
    runs-on: ubuntu-latest
    continue-on-error: true  # D-28: não bloquear merge se Lighthouse < 80
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd torre-de-controle && npm ci && npm run build
      - run: npm install -g @lhci/cli@0.15.x
      - run: cd torre-de-controle && lhci autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

**`.github/workflows/deploy.yml` (push em main):**
```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      backend: ${{ steps.filter.outputs.backend }}
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
      - name: Install
        run: cd api && bun install --frozen-lockfile
      # CRITICAL: --strict requer confirmação em data-loss. CI sem TTY → falha imediato em mudança destrutiva. Esse é o comportamento desejado (D-37 risk aceito).
      - name: Drizzle push schema
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_PROD }}
        run: cd api && bunx drizzle-kit push --strict --verbose
      - name: Deploy to Railway
        run: |
          npm install -g @railway/cli
          railway up --service=${{ secrets.RAILWAY_SERVICE_ID }} --detach
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
      - name: Upload Sentry source maps (backend)
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT: torre-api
        run: |
          npm install -g @sentry/cli
          # Bun não gera source maps por padrão; se precisar, ajustar build
          # sentry-cli sourcemaps upload api/dist  (se houver build step)

  deploy-frontend:
    needs: detect
    if: needs.detect.outputs.frontend == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd torre-de-controle && npm ci
      - name: Build (com source maps + Sentry upload via plugin)
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
          VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}
          VITE_VAPID_PUBLIC_KEY: ${{ secrets.VITE_VAPID_PUBLIC_KEY }}
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: ${{ secrets.SENTRY_ORG }}
          SENTRY_PROJECT: torre-frontend
        run: cd torre-de-controle && npm run build
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy torre-de-controle/dist --project-name=torre-de-controle --branch=main
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

**Secrets necessários (GH repo Settings → Secrets):**
- `DATABASE_URL_PROD` — Railway PostgreSQL connection string
- `RAILWAY_TOKEN` — Railway project token
- `RAILWAY_SERVICE_ID` — ID do serviço API (não secret, mas útil como variable)
- `CLOUDFLARE_API_TOKEN` — escopo: Pages Edit
- `CLOUDFLARE_ACCOUNT_ID` — account ID Cloudflare
- `SENTRY_AUTH_TOKEN` — auth token Sentry
- `SENTRY_ORG`, `SENTRY_PROJECT` — slugs
- `VITE_API_URL`, `VITE_SENTRY_DSN`, `VITE_VAPID_PUBLIC_KEY` — frontend build env
- `LHCI_GITHUB_APP_TOKEN` — opcional, comenta PR com results

### Pattern 9: Code-Splitting Vite + React Router v6

**Padrão (D-26 — Insights/Configurações/Geofences lazy):**
```typescript
// torre-de-controle/src/app/router.tsx
import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { AuthGuard } from './AuthGuard'
import { LoginPage } from './pages/login/LoginPage'  // eager: rota inicial
import { DashboardPage } from './pages/dashboard/DashboardPage'  // eager

// LAZY — só carrega quando navega
const TorreDeControlePage = lazy(() => import('./pages/torre-de-controle/TorreDeControlePage').then(m => ({ default: m.TorreDeControlePage })))
const ViagensPage = lazy(() => import('./pages/viagens/ViagensPage').then(m => ({ default: m.ViagensPage })))
const MotoristasPage = lazy(() => import('./pages/motoristas/MotoristasPage').then(m => ({ default: m.MotoristasPage })))
const GeofencesPage = lazy(() => import('./pages/geofences/GeofencesPage').then(m => ({ default: m.GeofencesPage })))
const AlertasPage = lazy(() => import('./pages/alertas/AlertasPage').then(m => ({ default: m.AlertasPage })))
const InsightsPage = lazy(() => import('./pages/insights/InsightsPage').then(m => ({ default: m.InsightsPage })))
const ConfiguracoesPage = lazy(() => import('./pages/configuracoes/ConfiguracoesPage').then(m => ({ default: m.ConfiguracoesPage })))

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
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: 'dashboard',         element: <DashboardPage /> },
        { path: 'torre-de-controle', element: <L><TorreDeControlePage /></L> },
        { path: 'viagens',           element: <L><ViagensPage /></L> },
        { path: 'motoristas',        element: <L><MotoristasPage /></L> },
        { path: 'geofences',         element: <L><GeofencesPage /></L> },
        { path: 'alertas',           element: <L><AlertasPage /></L> },
        { path: 'insights',          element: <L><InsightsPage /></L> },
        { path: 'configuracoes',     element: <L><ConfiguracoesPage /></L> },
      ],
    }],
  },
])
```

**MapLibre lazy (D-27):** Já é importado nas páginas que usam mapa, sem código no entry chunk (verificar com `npx vite build --report` se precisa).

### Pattern 10: shadcn Forms (Configurações)

```bash
# Add form components
npx shadcn@latest add form
```

```typescript
// Configuracoes/tabs/ThresholdsTab.tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const schema = z.object({
  atrasoCriticoMinutes: z.coerce.number().int().positive().max(300),
  desvioKmThreshold: z.coerce.number().positive().max(50),
  stopDurationMinutes: z.coerce.number().int().positive().max(120),
})

type FormData = z.infer<typeof schema>

export function ThresholdsTab({ initial, onSave }: { initial: FormData; onSave: (data: FormData) => Promise<void> }) {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: initial,
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
        <FormField
          control={form.control}
          name="atrasoCriticoMinutes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Atraso crítico (min)</FormLabel>
              <FormControl><Input type="number" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* ... outros campos */}
        <Button type="submit" disabled={form.formState.isSubmitting}>Salvar</Button>
      </form>
    </Form>
  )
}
```

### Anti-Patterns to Avoid

- **Retornar ReadableStream cru do handler Elysia** — wrap em `new Response(stream, { headers })`. Issue #1741.
- **Regenerar VAPID keys a cada deploy** — invalida 100% das subscriptions. Persistir em Railway env, gerar uma única vez.
- **`drizzle-kit push --force` em CI sem code review** — incidente real de wipe DB (Feb 2026). Sempre `--strict --verbose` + revisão humana.
- **Source maps `.map` publicados em prod sem upload Sentry** — vazamento de código. Usar `filesToDeleteAfterUpload`.
- **Service Worker scope errado** — registrar com `scope: '/'` (default), não `/torre-de-controle/`. SW só vê paths dentro do scope.
- **Fetch + Blob para download CSV** — perde cookie HttpOnly em alguns browsers, complicação JS desnecessária. Usar `window.location.href`.
- **`cloudflare/pages-action`** — DEPRECATED. Sempre `wrangler-action@v3`.
- **localStorage para JWT** — XSS = roubo de token. Já usa HttpOnly cookie (Phase 2), manter.
- **CORS `origin: '*'` em produção** — sempre `origin: FRONTEND_URL` exato (já é o pattern Phase 2).
- **Bun `--frozen-lockfile` sem ter committed lockfile** — CI falha. Confirmar `bun.lockb` ou `bun.lock` está no repo (verificar `.gitignore`).
- **Insights queries sem índice** — adicionar índices em `trips(window_end, sla_status, status)` e `alerts(occurred_at, type, severity)` se ainda não existem.
- **Push notification sem TTL** — push services dropam após período. Sempre `{ TTL: 60 }` em sendNotification.
- **Cross-filter via URL query string em Insights** — D-04 trade-off explícito: complexidade extra para MVP. Usar state local.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VAPID encryption / ECDH handshake | Custom crypto | `web-push@3.6.7` | Edge cases: aes128gcm encoding, salt, padding. Battle-tested. |
| CSV escape rules | Custom escape | Pequena helper `formatCsvRow` validada | Especificamente RFC 4180 (`"..."` wrap, `""` escape de aspas, separator `;` BR). Worth manter inline + tests. |
| Form state + validation | useState + manual validation | `react-hook-form` + `zod` | Re-renders, touched state, async validation, controlled vs uncontrolled — RHF resolve. |
| Date range picker | Custom calendar | `react-day-picker` (já vem com shadcn Calendar) | Acessibilidade, keyboard nav, locale. shadcn já tem `<Calendar>`. |
| PII scrubbing rules in Sentry | Confiar em "default scrubber" Sentry | Custom `beforeSend` recursive | Sentry default só pega keys comuns. LGPD exige scrub de lat/lng/CPF que não estão no default. |
| Push notification icon generation | Manual PNG | Existing icon-192/512 from PWA toolkit | `realfavicongenerator.net` ou similar gera todos tamanhos. |
| GitHub Actions monorepo path detection | Manual `git diff` | `dorny/paths-filter@v3` | Edge cases com branch merge, PR. |
| Cloudflare Pages SPA fallback | Custom Workers function | `_redirects` file `/* /index.html 200` | Plataforma nativa, zero overhead. |
| Sentry source maps upload | Manual sentry-cli step | `@sentry/vite-plugin` no build | Plugin descobre source maps automaticamente, deleta após upload, set release tag. |
| Drizzle schema versioning | Custom migration runner | `drizzle-kit push --strict` em CI (com review) | D-37 locked. Aceitar trade-off. |
| Lighthouse CI custom runner | Bash + lighthouse npm | `@lhci/cli` + `lhci autorun` | Auto-detect Vite preview, budget assertions config. |

**Key insight:** Phase 6 é **integração heavy**, não invention. 90% do trabalho é colar libs prontas seguindo padrões já estabelecidos. O risco maior está em **deploy** (CI/CD secrets, env vars, build env) — não em código.

## Runtime State Inventory

**Não aplicável** — Phase 6 é additive (novas tabelas, novos endpoints, novas páginas). Não renomeia nada que exista em runtime state. As 3 tabelas novas (`push_subscriptions`, `alert_thresholds`, `gps_providers`) são criadas via drizzle-kit push.

**Verificações:**
- **Stored data:** Nenhuma rename. Novas tabelas serão criadas. Seeds para `alert_thresholds` precisam ser inseridas (não destrutivo).
- **Live service config:** Nenhum n8n / Datadog / external configurado no projeto.
- **OS-registered state:** Nenhum — Bun rodando via Docker / Railway managed.
- **Secrets/env vars:** Adicionar (não renomear) — `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SENTRY_DSN`, `VITE_SENTRY_DSN`, `VITE_VAPID_PUBLIC_KEY`. Documentar em `.env.example`.
- **Build artifacts / installed packages:** Reinstall após adicionar deps. `bun.lockb` (ou `bun.lock`) commitar.

## Common Pitfalls

### Pitfall 1: drizzle-kit push wipe accidental
**What goes wrong:** `drizzle-kit push` aplicado sem review pode dropar colunas/tabelas. Incidente real 2026-02 em Railway via CC agent.
**Why it happens:** `--force` flag bypassa confirmação. Schema change destrutivo (rename column = drop+create) executa sem aviso.
**How to avoid:**
1. SEMPRE `--strict --verbose` em CI (não `--force`)
2. PR step com `--dry-run` ou inspeção manual do SQL
3. **NUNCA rodar drizzle-kit local apontando para DATABASE_URL prod** sem dupla checagem
4. Backup automático Railway PostgreSQL (verificar plano)
**Warning signs:** SQL preview mostrando `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`. Hang em prompt interativo no CI = data loss tentativa.

### Pitfall 2: Service Worker scope mismatch
**What goes wrong:** SW registrado de uma URL aninhada limita scope, push events não chegam para outras rotas.
**Why it happens:** Browser usa o path da chamada `register()` como scope default. Se chamar de `/configuracoes`, scope = `/configuracoes/*`.
**How to avoid:**
- `navigator.serviceWorker.register('/sw.js', { scope: '/' })` explícito
- SW file em `public/sw.js` (root, não subpasta)
- Verificar no DevTools → Application → Service Workers que scope = `/`
**Warning signs:** Push permission concedida mas notifications não aparecem. Console: "ServiceWorker scope is restricted".

### Pitfall 3: VAPID keys regenerated = mass unsubscribe
**What goes wrong:** Regenerar VAPID = todas subscriptions ativas tornam-se inválidas (401 do push service).
**Why it happens:** Subscription endpoint inclui chave pública do servidor no formato. Mudou a chave → endpoint inválido.
**How to avoid:**
- Gerar UMA vez localmente: `bunx web-push generate-vapid-keys --json`
- Persistir em Railway env (NUNCA em código)
- Documentar em README.md que regeneração quebra todos usuários
- Em caso de comprometimento de chave: gerar nova + comunicar usuários que precisam re-opt-in
**Warning signs:** Após deploy, push.sendNotification retornando massa de 410/404. Verificar VAPID env vars.

### Pitfall 4: ReadableStream 100% CPU (Elysia <1.4.28)
**What goes wrong:** Retornar `ReadableStream` direto do handler causa CPU 100% + latency 100x.
**Why it happens:** Bug Elysia versions < 1.4.28 (#1741).
**How to avoid:** Sempre `return new Response(stream, { headers: ... })`. Confirmar Elysia ≥ 1.4.28 (já pinned).
**Warning signs:** Endpoint CSV trava o server, requests subsequentes timeout.

### Pitfall 5: Source maps vazados em produção
**What goes wrong:** Arquivos `.map` publicados em CDN expõem código TypeScript original.
**Why it happens:** `vite build` com `sourcemap: true` gera + Cloudflare publica `dist/`.
**How to avoid:**
- `vite.config.ts`: `build.sourcemap: 'hidden'` (gera mas não referencia)
- `@sentry/vite-plugin` com `filesToDeleteAfterUpload: ['**/*.map']`
- Verificar `dist/` após build: `find dist -name "*.map"` deve ser vazio
**Warning signs:** Pegar `<script src=".../main-abc.js"></script>` em prod e checar se `.map` existe próximo.

### Pitfall 6: CORS + cookies em produção (cross-origin)
**What goes wrong:** Frontend `torre.{domain}.pages.dev` + Backend `api.{domain}.railway.app` = cross-origin. Cookie HttpOnly não vai sem config correta.
**Why it happens:** Browsers exigem `SameSite=None; Secure` para cookies cross-site + `Access-Control-Allow-Credentials: true`.
**How to avoid:**
- Auth plugin (Phase 2) já seta `sameSite: 'strict'` em dev — **trocar para `'none'` em prod**
- Backend CORS plugin já tem `credentials: true` (verificar)
- `FRONTEND_URL` env exato (não wildcard) na Railway
- Eden Treaty já manda `credentials: 'include'`
**Warning signs:** Login retorna 200, mas próxima request `/api/auth/me` retorna 401. Cookie não foi setado/enviado.

### Pitfall 7: Cloudflare Pages free tier limites (500 builds/mês)
**What goes wrong:** Disparar deploy em cada PR/commit = atingir limite.
**Why it happens:** Cada push trigger workflow. PR builds + main builds somam rápido.
**How to avoid:**
- D-34 já contempla: PR roda CI (lint/typecheck/build local), NÃO deploy
- Só `push: { branches: [main] }` dispara deploy
- Path filter (paths-filter@v3) — não deploya frontend se mudou só backend
**Warning signs:** Cloudflare dashboard mostrando "deployments quota exceeded" no dia 25 do mês.

### Pitfall 8: Insights query lenta (sem índice)
**What goes wrong:** `/api/insights/sla-history?range=90d` faz full table scan se trips não tem índice em `(window_end, status, sla_status)`.
**Why it happens:** Index existente é `idx_trips_window` (Phase 2) mas talvez não suficiente para filter + group.
**How to avoid:**
- Antes do plan, rodar `EXPLAIN ANALYZE` nas queries proposed
- Adicionar índices via Drizzle schema (migrate)
- Target p95 < 300ms (D-26 NFR)
**Warning signs:** Tempo de carregamento da página Insights > 3s. Logs pino mostrando query > 500ms.

### Pitfall 9: Bun setup-bun version mismatch em CI
**What goes wrong:** Local Bun 1.3.13, CI Bun 1.2.x → lockfile incompat, tipos divergem.
**Why it happens:** `setup-bun@v2` sem version explícita pega latest.
**How to avoid:**
- `with: { bun-version: 1.3.13 }` (versão exata do local)
- Verificar bun.lockb ou bun.lock commitado
**Warning signs:** `bun install --frozen-lockfile` falha com "lockfile out of date".

### Pitfall 10: Sentry free tier overflow
**What goes wrong:** 5k errors/mês esgotam em horas se erro em loop.
**Why it happens:** Erro em retry policy, WS reconnect failure, etc.
**How to avoid:**
- `tracesSampleRate: 0.1` (10% das transactions)
- Não capturar errors esperados (401, 404 user) — usar `ignoreErrors`
- Sentry dashboard → set quota alert em 80%
**Warning signs:** Sentry dashboard mostrando "rate limited" ou volume diário spike.

## Code Examples

### Schema novas tabelas (Drizzle)

```typescript
// api/src/db/schema/push-subscriptions.ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

export const pushSubscriptions = pgTable('push_subscriptions', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint:  text('endpoint').unique().notNull(),  // unique para dedupe
  p256dh:    text('p256dh').notNull(),
  auth:      text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type SelectPushSubscription = typeof pushSubscriptions.$inferSelect
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert
```

```typescript
// api/src/db/schema/alert-thresholds.ts
import { pgTable, varchar, integer, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

export const alertThresholds = pgTable('alert_thresholds', {
  type:       varchar('type', { length: 50 }).primaryKey(),  // 'atraso_critico_minutes' etc
  value:      integer('value').notNull(),
  updatedBy:  uuid('updated_by').references(() => users.id),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type SelectAlertThreshold = typeof alertThresholds.$inferSelect
```

```typescript
// api/src/db/schema/gps-providers.ts
import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const gpsProviders = pgTable('gps_providers', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:      varchar('name', { length: 100 }).notNull(),
  baseUrl:   text('base_url'),
  apiKey:    text('api_key'),  // STUB nessa fase — Phase 7+ integra
  isActive:  boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

```typescript
// Add column to users table (notification_preferences JSONB)
// api/src/db/schema/users.ts (modify)
import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:         varchar('name', { length: 100 }).notNull(),
  email:        varchar('email', { length: 150 }).unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  role:         varchar('role', { length: 20 }).notNull(),
  isActive:     boolean('is_active').default(true).notNull(),
  notificationPreferences: jsonb('notification_preferences').default({ critico: true, medio: false, baixo: false }),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
```

### Thresholds cache (in-memory 60s)

```typescript
// api/src/modules/thresholds/thresholds.service.ts
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
      set: { value, updatedBy, updatedAt: new Date() },
    })
  invalidateThresholdsCache()
}
```

### .env.example completo (Phase 6 update)

```bash
# ====================================================================
# BACKEND (api/.env)
# ====================================================================

# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/torre_controle

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=replace-with-64-byte-hex-secret-in-production
JWT_EXPIRES_IN=24h

# Server
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=debug

# Telemetry
TELEMETRY_API_KEY=dev-telemetry-key

# Web Push (Phase 6) — gerar com: bunx web-push generate-vapid-keys --json
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@torredecontrole.com

# Sentry (Phase 6) — opcional em dev, obrigatório em prod
SENTRY_DSN=
SENTRY_ENVIRONMENT=development

# ====================================================================
# FRONTEND (torre-de-controle/.env.local)
# ====================================================================
VITE_API_URL=http://localhost:3000
VITE_SENTRY_DSN=
VITE_VAPID_PUBLIC_KEY=

# Para build CI (não commitar!)
# SENTRY_AUTH_TOKEN=
# SENTRY_ORG=
# SENTRY_PROJECT=torre-frontend
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `cloudflare/pages-action@v1` | `cloudflare/wrangler-action@v3` | 2024 | DEPRECATED. Migração obrigatória. |
| Railway Nixpacks default | Railpack default | 2025 | Melhor suporte Bun. Set `"builder": "RAILPACK"` em `railway.json`. |
| `bun.lockb` (binary) | `bun.lock` (text) | Bun 1.2 (Mar 2025) | Text lockfile melhor para PR review. CI mais rápido. Migrar opcionalmente. |
| Sentry session replay free tier | Sem session replay | sempre | D-40 escolhe SEM replay (free tier 5k). |
| `vite-plugin-pwa` para tudo | Manual `sw.js` no `public/` | sempre | Para MVP push-only, plugin é overkill. |
| `pages.dev` "_redirects" required | Auto SPA detect (CF Pages) | 2024+ | Ainda recomendado `_redirects` para robustez. |
| `web-push` "only Node" reputation | Funciona em Bun (BoringSSL) | Bun 1.x estável | Confirmado nesta pesquisa via Bun crypto docs. |
| Drizzle-kit `--strict` default safety | 1.0 beta tornou `--strict` silently deprecated | 2026 (1.0.0-beta.9) | **Verificar** versão `drizzle-kit@0.31.10` (atual) ainda respeita `--strict`. Não atualizar para 1.0 beta. |

**Deprecated/outdated:**
- `cloudflare/pages-action` — usar `wrangler-action`
- `tailwind.config.ts` para Tailwind v4 — usar `@theme` em CSS (já é o padrão Phase 1b)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bun 1.3.13 local suficiente para Phase 6 (não precisa 1.4) | Environment | LOW — testes mostram compat para `bun install` e `bun run`. CI usa mesma versão. |
| A2 | `@hookform/resolvers` última versão estável compatível com `react-hook-form@7.76.1` + `zod@4.4.3` | Standard Stack | LOW — Resolvers atualiza junto com peer deps. Verificar via `npm view @hookform/resolvers peerDependencies` antes do plan. |
| A3 | `oven-sh/setup-bun@v2` é a tag estável recomendada em 2026 | Standard Stack / CI | LOW — se v2 quebrar, fallback v1. Pesquisa não confirmou explicitamente. |
| A4 | Drizzle 0.45.2 + drizzle-kit 0.31.10 (versões pinadas) respeitam `--strict` flag para safety | Pitfall 1 | MEDIUM — Bug `--strict` silently deprecated descoberto em drizzle-kit 1.0 beta. Versão atual (0.31.10) deve estar OK. **Verificar antes do plan: rodar `bunx drizzle-kit push --strict --verbose --dry-run` em local com mudança fake.** |
| A5 | Cloudflare Pages free tier permite >100 deploys/mês para projeto pequeno | Pitfall 7 | LOW — D-32 já minimiza deploys (path filter). |
| A6 | Railway free tier permite WebSocket persistente | Pattern 6 | LOW — Railway suporta WS, mas free tier expira ($5 trial). User deve confirmar tier antes deploy. |
| A7 | shadcn `<Form>` é compat com RHF 7.76.1 (versão mais recente) | Pattern 10 | LOW — shadcn componentes são template, mas API muda raramente. |
| A8 | Index `idx_trips_window` (Phase 2) é suficiente para Insights queries com 30d range | Pitfall 8 | MEDIUM — depende de seed volume. Pode precisar índice composto `(window_end, status, sla_status)`. **Executar EXPLAIN ANALYZE no plan.** |
| A9 | `@sentry/bun` v10.55.0 não está mais em beta | Standard Stack | LOW — versão major 10.x indica estável. |
| A10 | `notification_preferences` JSONB com defaults inseridos no migration via drizzle-kit push | Pattern 6 | MEDIUM — drizzle-kit push pode não setar default em coluna existente. Verificar plan se ALTER TABLE ADD COLUMN ... DEFAULT '{...}' funciona via push. Fallback: UPDATE manual após push. |

## Open Questions

1. **Railway free vs paid tier?** — D-30 locked Railway. User deve confirmar plano antes do deploy step. Trial $5 expira; produção real exige Hobby ($5/mês) ou Pro.
   - Recommendation: documentar no plan como pré-requisito humano.

2. **Cloudflare Pages custom domain configurado antes/depois?** — DNS setup separado do deploy. Para MVP, `*.pages.dev` é OK.
   - Recommendation: usar domain Cloudflare default no MVP, custom domain pós-MVP.

3. **`SENTRY_ORG` e `SENTRY_PROJECT` — criar projetos separados frontend/backend ou um só?** — Sentry recommend separados (filtragem mais limpa).
   - Recommendation: 2 projetos: `torre-api` + `torre-frontend`. Source maps separados.

4. **Email do admin para Sentry alerts (D-42)?** — Não temos channel definido.
   - Recommendation: usar email do Owner (admin do Sentry org), notificações default Sentry.

5. **`drizzle-kit push --strict` em CI: como confirmar interativamente?** — Não dá em CI sem TTY. Se schema change é destrutiva, push **TRAVA** o pipeline (que é o desejado).
   - Recommendation: explicar no plan que essa "falha" é proteção. Workflow: rodar `--dry-run` em PR local, confirmar SQL, depois push em main aplica.

6. **Web Push em iOS Safari 16+?** — Suporte só com PWA "Add to Home Screen". Pode quebrar em iPhone se usuário não adicionar como PWA.
   - Recommendation: documentar limitação no opt-in UI. "Funciona em desktop Chrome/Firefox/Safari e Android. Em iOS, instalar como app na tela inicial."

7. **Lighthouse CI URLs — testar quais rotas?** — Login não autenticado é trivial. Dashboard exige login.
   - Recommendation: configurar `lighthouserc.js` com puppeteerScript para login automatizado, OU testar apenas `/login` como smoke check. Plan decide.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Backend dev/CI | ✓ | 1.3.13 (local) | Docker `oven/bun:1` (já configurado em Dockerfile) |
| Node | Frontend dev/CI | ✓ | 24.14.0 | — |
| npm | Frontend dev/CI | ✓ | 11.9.0 | bun via Docker |
| Docker | dev local (PostgreSQL + Redis) | ✓ | 29.2.1 | — |
| PostgreSQL+PostGIS | Persistence | ✓ (Docker) | 16-3.4 (Postgres + PostGIS) | Railway managed (deploy) |
| Redis | Cache / pubsub | ✓ (Docker) | 7-alpine | Railway managed (deploy) |
| `git` | Version control | ✓ | (assumed) | — |
| Railway CLI | Deploy backend | ✗ (instalar via npm em CI) | — | Install via `npm install -g @railway/cli` no GH Actions step |
| Wrangler CLI | Deploy frontend | ✗ (vem via wrangler-action) | — | `cloudflare/wrangler-action@v3` baixa automaticamente |
| Sentry CLI | Source maps upload | ✗ (via `@sentry/vite-plugin`) | — | Plugin auto-baixa |
| `@lhci/cli` | Lighthouse CI | ✗ (install no CI step) | — | `npm install -g @lhci/cli@0.15.x` |

**Missing dependencies with no fallback:** Nenhuma — todas dependências são instaláveis automaticamente em CI ou já presentes localmente.

**Missing dependencies with fallback:**
- Railway CLI / Wrangler / Sentry CLI / LHCI: todos via npm/Docker action no CI

**Pré-requisitos humanos (não automatizáveis):**
- Criar conta Railway + project + serviços (PostgreSQL, Redis, API)
- Criar conta Cloudflare + Pages project
- Criar conta Sentry + 2 projetos (torre-api, torre-frontend)
- Gerar VAPID keys e adicionar a Railway env
- Configurar GH Secrets (todos listados na Pattern 8)
- (Opcional) custom domain DNS

## Security Domain

> `security_enforcement: true`, `security_asvs_level: "1"`, `security_block_on: "high"` — pesquisa security inclusa.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | HS256 cookie JWT (Phase 2) — manter. Login rate limit existente. |
| V3 Session Management | yes | HttpOnly cookie, Redis blacklist (Phase 2) — manter. **Mudar SameSite para 'none' + Secure em prod cross-origin.** |
| V4 Access Control | yes | RBAC `requireRole('admin')` em `/api/users/*`, `/api/alert-thresholds/*`, `/api/gps-providers/*`. ASVS V4.1.1 — função de acesso aplicada server-side. |
| V5 Input Validation | yes | TypeBox backend (Elysia) + Zod frontend (RHF). Defense in depth. ASVS V5.1.3 — input validation server-side. |
| V6 Cryptography | yes | `web-push@3.6.7` (não hand-roll). VAPID via lib. Secrets em env vars. NEVER em código. |
| V7 Error Handling / Logging | yes | Pino logs structured (Phase 2) + Sentry com beforeSend PII scrub (Pattern 5). ASVS V7.3.4 — sem PII em logs. |
| V8 Data Protection | yes | LGPD — lat/lng/email/phone scrubbed via Sentry beforeSend. Cookie HttpOnly. **Source maps NÃO publicados** (Pattern 7 — filesToDeleteAfterUpload). |
| V9 Communications | yes | HTTPS obrigatório (Railway + Cloudflare default). CORS strict — `FRONTEND_URL` específico, não wildcard. |
| V11 Business Logic | partial | Thresholds editáveis só por admin. Alert preferences editáveis só pelo próprio user. |
| V12 Files/Resources | n/a | Não upload arquivo. |
| V13 API/Web Service | yes | OpenAPI/Swagger (Phase 2 já gera) — **NÃO expor publicamente em prod** (D-43 implícito). Authenticated endpoints só. |
| V14 Configuration | yes | Secrets em Railway env (não código). `.env.example` documenta. NODE_ENV=production set. |

### Known Threat Patterns for {Bun + Elysia + React}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via filter params | Tampering | Drizzle parameterized queries (already used). NEVER concatenar SQL com input. |
| XSS via Insights data | Tampering | React auto-escape JSX. Chart.js tooltips usam textContent, não innerHTML. Não usar `dangerouslySetInnerHTML`. |
| CSRF em endpoints POST | Tampering | Cookie `SameSite=strict` (dev) ou `none + Secure` (prod cross-site). Mas CORS strict + token Bearer não usado = baixo risco. |
| JWT token theft via XSS | Information disclosure | HttpOnly cookie (Phase 2 ✓). |
| PII em error reports | Information disclosure | Sentry `beforeSend` recursive scrub (Pattern 5). |
| Source code leak via .map | Information disclosure | `vite.config.ts` build.sourcemap: 'hidden' + plugin filesToDeleteAfterUpload. |
| Push notification spam (DDoS) | DoS | Backend rate-limit em `/api/push/subscribe`. Max 5 subs por user (cleanup velhas). |
| Webhook injection (telemetry) | Spoofing / Tampering | `X-API-KEY` validation (Phase 2 ✓). Rotacionar `TELEMETRY_API_KEY` em prod (não dev key). |
| Drizzle schema wipe via push | DoS / data destruction | `--strict` em CI + code review obrigatório (Pitfall 1). |
| Open VAPID key reuse (man-in-the-middle subs) | Spoofing | VAPID Public Key não é secret, mas Private Key SIM. Manter `VAPID_PRIVATE_KEY` em Railway secret store. |
| CORS bypass via wildcard | Information disclosure | `cors({ origin: FRONTEND_URL })` exato (Phase 2 ✓). |
| Excessive Insights query (resource exhaustion) | DoS | Add `limit` server-side (max 90d). Cache via TanStack Query 30s (D-29). |

**Additional Phase 6-specific controls:**
- **CSV export quota:** Limit `50000` rows max (não unlimited).
- **Lighthouse Best Practices ≥80** verifica algumas vulnerabilidades (HTTPS, deprecated APIs).
- **Sentry rate limit** (D-40) protege contra error storm DoS no próprio Sentry.

## Validation Architecture

> `workflow.nyquist_validation: false` em `.planning/config.json` — **Seção pulada conforme política**. Validation manual ad hoc + Lighthouse CI (já documentado em Pattern 8).

## Project Constraints (from CLAUDE.md)

- **Caveman mode (Full)** — respostas conversacionais terse, mas RESEARCH.md/PLAN.md em prosa profissional. Esta research segue formato profissional (escopo permitido).
- **Skill Selection Policy** — Phase 6 não exige skills cybersec específicas além do que GSD `/gsd-secure-phase` já carrega. Recomendar `agent-skills` MCP search se planner identificar gap em deploy/CI especializado.
- **GSD Advisor `--discuss` auto-append** — Phase 6 já passou por `/gsd-plan-phase --discuss` (CONTEXT.md gerado). Continuar respeitando.
- **Developer Profile (terse-direct + fast-intuitive)** — Plan tasks devem ser action-first, sem options paralysis. Recomendar e proceder.
- **CLAUDE.md guidance — UX = funcional, sem polish além do necessário** — Phase 6 polish é Lighthouse ≥80 + mobile tablet+. Não over-engineer.

## Sources

### Primary (HIGH confidence)
- [Bun Node.js crypto compat docs](https://bun.com/reference/node/crypto) — confirmou `createECDH` suportado
- [Drizzle ORM iterator](https://orm.drizzle.team/docs/select) — pattern para CSV streaming
- [Sentry Vite plugin docs](https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite/) — source maps upload
- [Cloudflare wrangler-action README](https://github.com/cloudflare/wrangler-action) — deploy step
- [bun.com Railway guide](https://bun.com/docs/guides/deployment/railway) — deploy Bun on Railway
- [Elysia release notes 1.4.28](https://github.com/elysiajs/elysia/releases) — stream fix #1741
- [Drizzle drizzle-kit push docs](https://orm.drizzle.team/docs/drizzle-kit-push) — `--strict` flag
- npm registry version verification (2026-05-28) — todas versões pinned

### Secondary (MEDIUM confidence)
- [MDN ServiceWorkerRegistration showNotification](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification)
- [MDN PushManager](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/pushManager)
- [Sentry Sensitive Data docs](https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/)
- [shadcn React Hook Form](https://ui.shadcn.com/docs/forms/react-hook-form)
- [dorny/paths-filter v3](https://github.com/dorny/paths-filter)
- [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun)
- [Railway GitHub Actions blog](https://blog.railway.com/p/github-actions)

### Tertiary (LOW confidence — flagged for validation)
- Drizzle `--strict` behavior em drizzle-kit 0.31.10 — confirmado em docs mas comportamento exato em CI sem TTY exige teste local antes do deploy
- Lighthouse CI exact config para auth-required routes — open question #7
- iOS Safari 16+ push notification limitations — open question #6

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versões verificadas em npm registry 2026-05-28
- Architecture patterns: HIGH — todos com source citado, pattern já validado no codebase ou em docs oficiais
- Pitfalls: HIGH — incidentes reais documentados (drizzle wipe Feb 2026, Elysia #1741), best practices Sentry/CF/Railway oficiais
- Deploy specifics: MEDIUM — wrangler-action e railway up confirmados, mas pré-requisitos humanos (criar accounts) não automatizáveis
- Security: HIGH — ASVS L1 mapeado, threats stack-específicos identificados

**Research date:** 2026-05-28
**Valid until:** 2026-06-28 (30 dias — stack estável). Re-verificar se passar 30+ dias antes de iniciar execução.

---

*Phase: 06-insights-polish-deploy*
*Researcher: gsd-researcher (Sonnet)*
*Next step: `gsd-planner` consome este RESEARCH.md + 06-CONTEXT.md → produz N×PLAN.md files.*
