# Phase 2: Backend Core + Auth — Pattern Map

**Mapped:** 2026-04-30
**Files analyzed:** 22 new files (api/ directory, created from scratch)
**Analogs found:** 5 / 22 (all in torre-de-controle/src/ — frontend only codebase; no backend exists yet)

---

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `api/src/index.ts` | config/bootstrap | request-response | `torre-de-controle/src/app/router.tsx` | partial (composition pattern) |
| `api/src/db/client.ts` | config | — | none | no analog |
| `api/src/db/schema/drivers.ts` | model | CRUD | `torre-de-controle/src/data/types.ts` (Driver) | type-reference |
| `api/src/db/schema/vehicles.ts` | model | CRUD | `torre-de-controle/src/data/types.ts` | type-reference |
| `api/src/db/schema/trips.ts` | model | CRUD | `torre-de-controle/src/data/types.ts` (Trip) | type-reference |
| `api/src/db/schema/alerts.ts` | model | CRUD | `torre-de-controle/src/data/types.ts` (Alert) | type-reference |
| `api/src/db/schema/treatments.ts` | model | CRUD | none | no analog |
| `api/src/db/schema/clients.ts` | model | CRUD | none | no analog |
| `api/src/db/schema/routes.ts` | model | CRUD | none | no analog |
| `api/src/db/schema/users.ts` | model | CRUD | none | no analog |
| `api/src/db/schema/driver-documents.ts` | model | CRUD | `torre-de-controle/src/data/types.ts` (DriverDocument) | type-reference |
| `api/src/db/schema/index.ts` | config | — | `torre-de-controle/src/data/mocks/index.ts` | partial (barrel export) |
| `api/src/db/seed/index.ts` | utility | batch | `torre-de-controle/src/data/mocks/trips.ts` + `drivers.ts` | data-shape reference |
| `api/src/redis/client.ts` | config | — | none | no analog |
| `api/src/modules/auth/auth.plugin.ts` | middleware | request-response | none | no analog (RESEARCH.md patterns apply) |
| `api/src/modules/auth/auth.service.ts` | service | request-response | none | no analog |
| `api/src/modules/trips/trips.plugin.ts` | controller | CRUD | `torre-de-controle/src/hooks/useTrips.ts` | filter-contract reference |
| `api/src/modules/trips/trips.service.ts` | service | CRUD | none | no analog |
| `api/src/modules/drivers/drivers.plugin.ts` | controller | CRUD | `torre-de-controle/src/hooks/useDrivers.ts` | filter-contract reference |
| `api/src/modules/drivers/drivers.service.ts` | service | CRUD | none | no analog |
| `api/src/modules/alerts/alerts.plugin.ts` | controller | CRUD | `torre-de-controle/src/hooks/useAlerts.ts` | filter-contract reference |
| `api/src/modules/alerts/alerts.service.ts` | service | CRUD | none | no analog |
| `api/src/modules/vehicles/vehicles.plugin.ts` | controller | request-response | none | no analog |
| `api/src/modules/vehicles/vehicles.service.ts` | service | request-response | none | no analog |
| `api/src/modules/dashboard/dashboard.plugin.ts` | controller | request-response | `torre-de-controle/src/hooks/useDashboardKPIs.ts` | KPI-shape reference |
| `api/src/lib/logger.ts` | utility | — | none | no analog |
| `api/src/lib/rbac.ts` | middleware | request-response | none | no analog |
| `api/drizzle.config.ts` | config | — | none | no analog |
| `api/package.json` | config | — | `torre-de-controle/package.json` | partial |
| `api/tsconfig.json` | config | — | `torre-de-controle/tsconfig.json` | partial |
| `docker-compose.yml` | config | — | none | no analog |
| `api/Dockerfile` | config | — | none | no analog |
| `api/.env.example` | config | — | none | no analog |

---

## Pattern Assignments

### Drizzle Schema Files — Type Mapping from Frontend Types

**Analog:** `torre-de-controle/src/data/types.ts`

This file is the authoritative source for all entity shapes. Every Drizzle schema column must correspond to a field in the frontend types. The mapping below drives all schema files.

**Driver entity** (types.ts lines 29-47):
```typescript
export interface Driver {
  id: string
  code: string                    // MTR-7822
  name: string
  phone: string
  email?: string
  photoUrl?: string
  status: DriverStatus            // 'available' | 'on_route' | 'unavailable'
  operationalScore: number        // 0-100
  plate: string
  vehicleType: string             // Van, Furgão, VUC
  base: string                    // CD São Paulo, CD Rio, etc
  documents: DriverDocument[]
  deliveriesToday: number
  avgDelayMinutes: number
  lat: number
  lng: number
  address: string
}
```

**Drizzle mapping rule** — camelCase JS → snake_case SQL column name (explicit):
```typescript
// ARCHITECTURE.md schema for drivers table
// api/src/db/schema/drivers.ts
import { pgTable, uuid, varchar, integer, timestamp, text } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const drivers = pgTable('drivers', {
  id:               uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  code:             varchar('code', { length: 20 }).unique().notNull(),
  name:             varchar('name', { length: 100 }).notNull(),
  phone:            varchar('phone', { length: 20 }),
  photoUrl:         text('photo_url'),
  status:           varchar('status', { length: 20 }).default('available').notNull(),
  operationalScore: integer('operational_score').default(100),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export type SelectDriver = typeof drivers.$inferSelect
export type InsertDriver = typeof drivers.$inferInsert
```

**Trip entity** (types.ts lines 50-77):
```typescript
export interface Trip {
  id: string
  code: string                    // KLP-9081
  driverId: string
  driverName: string
  driverPhoto?: string
  plate: string
  clientName: string
  operationName: string
  routeCode: string
  priority: Priority              // 'alta' | 'media' | 'baixa'
  origin: string
  destination: string
  originLat: number; originLng: number
  destLat: number;   destLng: number
  windowStart: Date; windowEnd: Date
  eta: Date
  departedAt?: Date; arrivedAt?: Date
  status: TripStatus              // 'planned'|'in_progress'|'completed'|'delayed'|'cancelled'
  slaStatus: SlaStatus            // 'no_prazo'|'em_risco'|'atrasado'|'sem_sinal'
  progressPct: number
  distanceTotal: number; distanceDone: number
}
```
Note: `driverName`, `plate`, `clientName`, `routeCode`, `operationName` are **denormalized on the frontend**. The DB schema uses FK references (driver_id, vehicle_id, client_id, route_id) — these resolved fields come from JOIN queries in the service layer.

**Alert entity** (types.ts lines 80-104):
```typescript
export interface Alert {
  id: string
  type: AlertType
  severity: AlertSeverity         // 'critico'|'medio'|'baixo'
  status: AlertStatus             // 'aberto'|'em_tratativa'|'resolvido'
  tripId: string; tripCode: string
  driverId: string; driverName: string
  plate: string; clientName: string; routeCode: string
  title: string; description: string
  source: AlertSource             // 'GPS'|'Checklist'|'Telemetria'|'Manual'
  lat?: number; lng?: number
  delayMinutes?: number; deviationKm?: number
  occurredAt: Date
  slaDeadline?: Date
  assignedTo?: string
  resolvedAt?: Date
}
```

**DriverDocument entity** (types.ts lines 22-27):
```typescript
export interface DriverDocument {
  type: string                    // CNH, Exame Toxicológico, Treinamento
  status: DocStatus               // 'valido'|'vence_em_breve'|'vencido'
  expiresAt: Date
  issuedAt?: Date
}
```

---

### `api/src/db/seed/index.ts` (utility, batch)

**Analogs:** `torre-de-controle/src/data/mocks/drivers.ts` and `torre-de-controle/src/data/mocks/trips.ts`

These files are the **authoritative source for realistic seed data**. Use them as reference for:
- Brazilian driver names, phone formats `(11) 98xxx-xxxx`, email pattern `name@torre.fic`
- Vehicle types: `'Van' | 'Furgão' | 'VUC'`
- Base names: `'CD São Paulo' | 'CD Guarulhos' | 'CD Campinas' | 'CD Osasco' | 'CD ABC'`
- Plate formats: `KLP-9081` (old) and `BZK-1120` (Mercosul-style)
- Client pool (drivers.ts line 189): `['Shopee', 'Magazine Luiza', 'Mercado Livre', 'Amazon']`
- SLA status distribution (trips.ts lines 198-203): 10 no_prazo, 3 em_risco, 1 atrasado, 1 sem_sinal per 15 in_progress
- Document status values (drivers.ts lines 14-17): `'valido' | 'vence_em_breve' | 'vencido'`
- Document types (drivers.ts line 14): `'CNH' | 'Exame Toxicológico' | 'Treinamento Defensivo'`

**Canonical driver shape from mocks** (drivers.ts lines 10-20 — representative entry):
```typescript
{
  id: 'drv-001', code: 'MTR-7822', name: 'Carlos Henrique Souza',
  phone: '(11) 98123-4501', email: 'carlos.souza@torre.fic',
  status: 'on_route', operationalScore: 94,
  plate: 'KLP-9081', vehicleType: 'Van', base: 'CD São Paulo',
  documents: [
    { type: 'CNH',                   status: 'valido',         expiresAt: monthsFromNow(11) },
    { type: 'Exame Toxicológico',    status: 'valido',         expiresAt: monthsFromNow(8) },
    { type: 'Treinamento Defensivo', status: 'vence_em_breve', expiresAt: daysFromNow(20) },
  ],
  deliveriesToday: 12, avgDelayMinutes: -3,
  lat: -23.5505, lng: -46.6333, address: 'Av. Paulista, 1500 — São Paulo/SP',
}
```

**Status distribution targets** (per D-08, from mocks):
- Motoristas: 12 on_route, 4 available, 2 unavailable (from 22 canonical)
- Viagens: 15 in_progress (10 no_prazo, 3 em_risco, 1 atrasado, 1 sem_sinal), 6 planned, 9 completed, 1 delayed (from 31 canonical + 30 generated = 61 total — satisfies D-06 50+ target)

---

### `api/src/modules/trips/trips.plugin.ts` (controller, CRUD)

**Filter contract analog:** `torre-de-controle/src/hooks/useTrips.ts`

The API query parameters must accept exactly the same filter keys that the frontend hooks expose. From useTrips.ts lines 13-30:

```typescript
// Filter keys the frontend hook applies — these become t.Object() query params
// useTrips.ts lines 13-30 (all filter fields):
(!filters.status     || t.status     === filters.status) &&    // TripStatus enum
(!filters.slaStatus  || t.slaStatus  === filters.slaStatus) && // SlaStatus enum
(!filters.clientName || t.clientName === filters.clientName) &&
(!filters.driverName || t.driverName.toLowerCase().includes(...)) &&
(!filters.priority   || t.priority   === filters.priority) &&  // Priority enum
(!filters.routeCode  || t.routeCode  === filters.routeCode) &&
(!filters.search     || ...)  // searches code, driverName, plate, clientName
```

**Hook return contract** (useTrips.ts lines 5-11 — MUST be preserved in Phase 3 TanStack Query replacement):
```typescript
interface UseTripsReturn {
  data: Trip[]
  isLoading: false       // TanStack Query will set this dynamically
  isError: false         // TanStack Query will set this dynamically
  error: null
  refetch: () => void
}
```

---

### `api/src/modules/drivers/drivers.plugin.ts` (controller, CRUD)

**Filter contract analog:** `torre-de-controle/src/hooks/useDrivers.ts`

From useDrivers.ts lines 13-27:
```typescript
// Filter keys → API query params:
(!filters.status || d.status === filters.status) &&   // DriverStatus: available|on_route|unavailable
(!filters.base   || d.base   === filters.base) &&     // string: 'CD São Paulo' etc
(!filters.search || ...)  // searches name, code, plate
```

---

### `api/src/modules/alerts/alerts.plugin.ts` (controller, CRUD)

**Filter contract analog:** `torre-de-controle/src/hooks/useAlerts.ts`

From useAlerts.ts lines 13-30:
```typescript
// Filter keys → API query params:
(!filters.severity   || a.severity   === filters.severity) &&    // critico|medio|baixo
(!filters.status     || a.status     === filters.status) &&      // aberto|em_tratativa|resolvido
(!filters.type       || a.type       === filters.type) &&        // AlertType enum
(!filters.clientName || a.clientName === filters.clientName) &&
(!filters.routeCode  || a.routeCode  === filters.routeCode) &&
(!filters.assignedTo || a.assignedTo === filters.assignedTo) &&
(!filters.search     || ...)  // searches title, driverName, plate, tripCode
// Note: filters.period ('today'|'7d'|'30d') present in AlertFilters type but not in mock filter — add to API
```

**Additional hook from useAlerts.ts lines 40-50** — the `useAlertsBySeverity` grouping must be served by the API returning all alerts (client groups them) or via a dedicated `/api/alerts/stats` endpoint:
```typescript
export function useAlertsBySeverity(): {
  critico: Alert[]
  medio: Alert[]
  baixo: Alert[]
}
```

---

### `api/src/modules/dashboard/dashboard.plugin.ts` (controller, request-response)

**KPI shape analog:** `torre-de-controle/src/hooks/useDashboardKPIs.ts`

The `/api/dashboard/kpis` response must return a shape compatible with all KPI interfaces. From useDashboardKPIs.ts lines 1-22:

```typescript
// Five KPI functions — all served by one endpoint or five separate ones:
useDashboardKPIs()  → KPIDashboard
useTorreKPIs()      → KPITorre
useViagensKPIs()    → KPIViagens
useMotoristasKPIs() → KPIMotoristas
useAlertasKPIs()    → KPIAlertas
```

**KPIDashboard shape** (types.ts lines 121-127):
```typescript
export interface KPIDashboard {
  entregas:              { onTime: number; total: number; pct: number }
  sla:                   { pct: number; meta: number }
  motoristasEmRisco:     { count: number; total: number; sparkline: number[] }
  atrasosCriticos:       { count: number; total: number; sparkline: number[] }
  paradasNaoPlanejadas:  { count: number; total: number; sparkline: number[] }
}
```

**KPITorre shape** (types.ts lines 129-135):
```typescript
export interface KPITorre {
  viagensAtivas:    { count: number; total: number }
  emRisco:          { count: number; total: number }
  atrasosCriticos:  { count: number; total: number }
  semSinal:         { count: number; total: number }
  ocorrencias:      { criticas: number; medias: number }
}
```

---

### `api/src/index.ts` (bootstrap, request-response)

**Composition analog:** `torre-de-controle/src/app/router.tsx`

The router.tsx shows the same flat composition pattern (list of routes/pages registered in one place). Apply the same approach for Elysia plugins:

```typescript
// router.tsx lines — one central registry, no business logic
// Torre router registers pages; api/src/index.ts registers plugins:
export const app = new Elysia()
  .use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true }))
  .use(swagger())
  .use(authPlugin)
  .use(tripsPlugin)
  .use(driversPlugin)
  .use(alertsPlugin)
  .use(vehiclesPlugin)
  .use(dashboardPlugin)
  .listen(3000)

export type App = typeof app  // D-04: Eden Treaty type export
```

---

### `api/src/db/schema/index.ts` (barrel export)

**Analog:** `torre-de-controle/src/data/mocks/index.ts`

From mocks/index.ts — the barrel export pattern:
```typescript
// mocks/index.ts — re-exports everything from submodules
export { mockTrips } from './trips'
export { mockDrivers } from './drivers'
export { mockAlerts } from './alerts'
export { kpisDashboard, kpisTorre, kpisViagens, kpisMotoristas, kpisAlertas } from './kpis'
export { mockTimelineEvents } from './timelineEvents'
```

Apply same pattern to schema/index.ts:
```typescript
// api/src/db/schema/index.ts
export * from './users'
export * from './drivers'
export * from './vehicles'
export * from './trips'
export * from './alerts'
export * from './treatments'
export * from './clients'
export * from './routes'
export * from './driver-documents'
```

---

## Shared Patterns

### TypeScript Naming Conventions
**Source:** `torre-de-controle/src/data/types.ts`
**Apply to:** All Drizzle schema files, service files

- Union types preferred over enums: `type TripStatus = 'planned' | 'in_progress' | 'completed' | 'delayed' | 'cancelled'`
- camelCase for JS identifiers, snake_case only in SQL column name argument
- Optional fields use `?` suffix (not `| undefined`): `email?: string`
- Interface for shapes, type alias for unions
- All date fields typed as `Date` objects (not strings) — use `timestamp({ withTimezone: true })` in Drizzle (default `mode: 'date'`)

### Enum Values (copy exact strings — frontend depends on these)
**Source:** `torre-de-controle/src/data/types.ts` lines 1-8

```typescript
// THESE MUST MATCH EXACTLY — frontend hardcodes these strings in filters and display
type SlaStatus    = 'no_prazo' | 'em_risco' | 'atrasado' | 'sem_sinal'
type TripStatus   = 'planned' | 'in_progress' | 'completed' | 'delayed' | 'cancelled'
type AlertSeverity = 'critico' | 'medio' | 'baixo'
type AlertStatus   = 'aberto' | 'em_tratativa' | 'resolvido'
type DriverStatus  = 'available' | 'on_route' | 'unavailable'
type Priority      = 'alta' | 'media' | 'baixa'
type DocStatus     = 'valido' | 'vence_em_breve' | 'vencido'
```

These same string values go into Drizzle `varchar` columns and TypeBox `t.Union([t.Literal(...)])` validators.

### AlertType Values
**Source:** `torre-de-controle/src/data/types.ts` lines 10-17
```typescript
type AlertType =
  | 'atraso_critico'
  | 'desvio_nao_autorizado'
  | 'parada_nao_planejada'
  | 'sinal_gps_intermitente'
  | 'tempo_parada_elevado'
  | 'entrega_fora_janela'
  | 'checklist_incompleto'
```

### Hook Return Contract
**Source:** `torre-de-controle/src/hooks/useTrips.ts` lines 5-11
**Apply to:** All Phase 3 TanStack Query hooks (NOT Phase 2, but API response shapes must enable it)

```typescript
// All hooks return this shape — TanStack Query preserves it:
{ data: T[], isLoading: boolean, isError: boolean, error: unknown | null, refetch: () => void }
```

The API responses must return arrays and single objects that map cleanly to `T[]` / `T` — no extra nesting beyond `{ data: T[] }` envelope.

### Brazilian Data Conventions
**Source:** `torre-de-controle/src/data/mocks/drivers.ts` lines 7-20
**Apply to:** `api/src/db/seed/index.ts`

- Phone: `(11) 9XXXX-XXXX` format
- Email: `firstname.lastname@torre.fic` (internal mock domain)
- Old plates: `ABC-1234` (3 letters + 4 digits)
- Mercosul plates: `ABC-1D23` (3 letters + digit + letter + 2 digits)
- Coordinates: SP region `-23.xx, -46.xx`; Campinas `-22.9x, -47.0x`
- Bases: `'CD São Paulo' | 'CD Guarulhos' | 'CD Campinas' | 'CD Osasco' | 'CD ABC'`

---

## No Analog Found

Files with no close match in the codebase. Use RESEARCH.md patterns exclusively:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `api/src/modules/auth/auth.plugin.ts` | middleware | request-response | No auth exists in frontend-only codebase |
| `api/src/modules/auth/auth.service.ts` | service | request-response | Same |
| `api/src/db/client.ts` | config | — | No backend DB layer exists |
| `api/src/redis/client.ts` | config | — | No Redis layer exists |
| `api/src/lib/logger.ts` | utility | — | No structured logging exists |
| `api/src/lib/rbac.ts` | middleware | request-response | No auth/roles system exists |
| `api/src/modules/*/trips.service.ts` etc | service | CRUD | All service logic is new |
| `api/drizzle.config.ts` | config | — | No Drizzle in codebase |
| `docker-compose.yml` | config | — | No infra config exists |
| `api/Dockerfile` | config | — | No container config exists |

For these files, follow the patterns verbatim from RESEARCH.md sections:
- "Pattern 1: Elysia Plugin por Módulo" → all `*.plugin.ts` files
- "Pattern 2: Auth com JWT HttpOnly Cookie" → `auth.plugin.ts`
- "Pattern 3: RBAC via .derive() + .guard()" → `auth.plugin.ts`, `rbac.ts`
- "Pattern 4: Drizzle Schema + $inferSelect" → all schema files
- "Pattern 5: Eden Treaty" → `index.ts` export
- "Pattern 6: drizzle.config.ts" → `drizzle.config.ts`
- "Drizzle DB Client com postgres.js" → `db/client.ts`
- "Redis blacklist no logout" → `auth.service.ts`
- "Docker Compose" → `docker-compose.yml`
- "Dockerfile para API Bun" → `api/Dockerfile`

---

## Metadata

**Analog search scope:** `torre-de-controle/src/` (entire frontend source tree)
**Files scanned:** 78 TypeScript/TSX files
**Key constraint:** Zero backend code exists — this phase creates the entire `api/` directory from scratch. All backend patterns come from RESEARCH.md (verified via Context7 + npm registry). Frontend files provide: (1) exact entity shapes for Drizzle schema column mapping, (2) exact enum string values that DB must store, (3) exact filter key names that API query params must match, (4) KPI response shapes for the dashboard endpoint.
**Pattern extraction date:** 2026-04-30
