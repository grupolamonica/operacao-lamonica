---
phase: 01-ui-shell-design-system
plan: 03
type: execute
wave: 1
depends_on: [01]
files_modified:
  - torre-de-controle/src/data/types.ts
  - torre-de-controle/src/data/mocks/drivers.ts
  - torre-de-controle/src/data/mocks/trips.ts
  - torre-de-controle/src/data/mocks/alerts.ts
  - torre-de-controle/src/data/mocks/kpis.ts
  - torre-de-controle/src/data/mocks/timelineEvents.ts
  - torre-de-controle/src/data/mocks/index.ts
  - torre-de-controle/src/hooks/useDrivers.ts
  - torre-de-controle/src/hooks/useTrips.ts
  - torre-de-controle/src/hooks/useAlerts.ts
  - torre-de-controle/src/hooks/useDashboardKPIs.ts
  - torre-de-controle/src/hooks/useTripTimeline.ts
  - torre-de-controle/src/hooks/index.ts
autonomous: true
requirements:
  - PHASE1-TYPES
  - PHASE1-MOCK-DATA
  - PHASE1-DATA-HOOKS
tags:
  - frontend
  - types
  - mock-data
  - hooks

must_haves:
  truths:
    - "Tipos TypeScript definem Trip, Driver, Alert, KPIs com strict types"
    - "Mock data: 45+ viagens distribuídas em 4+ slaStatuses, 22+ motoristas, 40+ alertas, KPIs coerentes"
    - "Hooks retornam { data, isLoading: false, isError: false, error: null, refetch: () => void } — contrato Phase 2 pronto"
    - "Filtros funcionam nos hooks (useTrips por status, slaStatus, clientName)"
    - "Dados não contêm PII real — nomes/placas fictícios, emails em domínio @torre.fic"
  artifacts:
    - path: "torre-de-controle/src/data/types.ts"
      provides: "Interfaces para todas entidades + filters + KPIs"
      contains: "export interface Trip"
    - path: "torre-de-controle/src/data/mocks/trips.ts"
      provides: "45+ viagens mock (15 canonical + 30 generated)"
      min_lines: 200
    - path: "torre-de-controle/src/data/mocks/drivers.ts"
      provides: "22+ motoristas mock"
      min_lines: 150
    - path: "torre-de-controle/src/data/mocks/alerts.ts"
      provides: "40+ alertas mock (15 canonical + 25 generated)"
      min_lines: 200
    - path: "torre-de-controle/src/data/mocks/kpis.ts"
      provides: "KPIs Dashboard + Torre + Viagens + Motoristas + Alertas"
      contains: "kpisDashboard"
    - path: "torre-de-controle/src/hooks/useTrips.ts"
      provides: "Hook que retorna trips filtrados"
      contains: "TripFilters"
  key_links:
    - from: "torre-de-controle/src/hooks/useTrips.ts"
      to: "torre-de-controle/src/data/mocks/trips.ts"
      via: "import mockTrips"
      pattern: "from '@/data/mocks/trips'"
    - from: "torre-de-controle/src/data/mocks/trips.ts"
      to: "torre-de-controle/src/data/types.ts"
      via: "import type Trip"
      pattern: "from '@/data/types'"
---

<objective>
Definir contratos TypeScript completos para todas as entidades do domínio (Trip, Driver, Alert, KPIs, Filters) e popular mock data realista que reproduz exatamente os números/nomes das imagens de referência. Hooks abstraem o acesso aos dados — Phase 2 troca apenas o corpo dos hooks por TanStack Query, sem mudar consumidores.

Purpose: Sem types e mocks, plans 04/05/06 não conseguem renderizar nada com dados realistas. A interface dos hooks (`{data, isLoading, error}`) é o contrato que sobrevive a Phase 2.
Output: types.ts completo + 5 arquivos de mock + 5 hooks importáveis.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ARCHITECTURE.md
@.planning/phases/01-ui-shell-design-system/01-CONTEXT.md
@.planning/phases/01-ui-shell-design-system/01-RESEARCH.md
</context>

<interfaces>
<!-- Contratos que PLAN-04/05/06 vão consumir -->

```typescript
// types.ts
export type SlaStatus = 'no_prazo' | 'em_risco' | 'atrasado' | 'sem_sinal'
export type TripStatus = 'planned' | 'in_progress' | 'completed' | 'delayed' | 'cancelled'
export type AlertSeverity = 'critico' | 'medio' | 'baixo'
export type AlertStatus = 'aberto' | 'em_tratativa' | 'resolvido'
export type DriverStatus = 'available' | 'on_route' | 'unavailable'
export type Priority = 'alta' | 'media' | 'baixa'
export type DocStatus = 'valido' | 'vence_em_breve' | 'vencido'
export type AlertType =
  | 'atraso_critico' | 'desvio_nao_autorizado' | 'parada_nao_planejada'
  | 'sinal_gps_intermitente' | 'tempo_parada_elevado'
  | 'entrega_fora_janela' | 'checklist_incompleto'

interface Trip { id, code, driverId, driverName, driverPhoto?, plate, clientName, operationName, routeCode, priority, origin, destination, originLat, originLng, destLat, destLng, windowStart, windowEnd, eta, departedAt?, arrivedAt?, status, slaStatus, progressPct, distanceTotal, distanceDone }

interface Driver { id, code, name, phone, email, photoUrl?, status, operationalScore, plate, vehicleType, base, documents[], deliveriesToday, avgDelayMinutes, lat, lng, address }

interface Alert { id, type, severity, status, tripId, tripCode, driverId, driverName, driverPhoto?, plate, clientName, routeCode, title, description, source, lat?, lng?, delayMinutes?, deviationKm?, occurredAt, slaDeadline?, assignedTo? }

// Hooks — contrato Phase 2 (TanStack Query vai implementar mesma interface)
// CRITICAL: isError e refetch incluídos para compatibilidade Phase 2 desde Phase 1
useTrips(filters?: TripFilters): { data: Trip[]; isLoading: false; isError: false; error: null; refetch: () => void }
useDrivers(filters?: DriverFilters): { data: Driver[]; isLoading: false; isError: false; error: null; refetch: () => void }
useAlerts(filters?: AlertFilters): { data: Alert[]; isLoading: false; isError: false; error: null; refetch: () => void }
useDashboardKPIs(): { data: KPIDashboard; isLoading: false; isError: false; error: null; refetch: () => void }
useTripTimeline(tripId: string): { data: TimelineEvent[]; isLoading: false; isError: false; error: null; refetch: () => void }
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Definir types.ts completo + mock data (drivers, trips, alerts, kpis, timeline)</name>
  <files>torre-de-controle/src/data/types.ts, torre-de-controle/src/data/mocks/drivers.ts, torre-de-controle/src/data/mocks/trips.ts, torre-de-controle/src/data/mocks/alerts.ts, torre-de-controle/src/data/mocks/kpis.ts, torre-de-controle/src/data/mocks/timelineEvents.ts, torre-de-controle/src/data/mocks/index.ts</files>
  <read_first>
    - .planning/ARCHITECTURE.md (seções "Database Entities" — campos exatos de cada tabela)
    - .planning/phases/01-ui-shell-design-system/01-CONTEXT.md (seções de cada página descrevem campos visíveis)
    - .planning/phases/01-ui-shell-design-system/01-RESEARCH.md (seção "data/types.ts — interfaces principais")
  </read_first>
  <action>
**1. Criar `torre-de-controle/src/data/types.ts`** (expansão dos tipos do RESEARCH para cobrir todas as páginas):

```typescript
// ===== Enums / unions =====
export type SlaStatus    = 'no_prazo' | 'em_risco' | 'atrasado' | 'sem_sinal'
export type TripStatus   = 'planned' | 'in_progress' | 'completed' | 'delayed' | 'cancelled'
export type AlertSeverity = 'critico' | 'medio' | 'baixo'
export type AlertStatus  = 'aberto' | 'em_tratativa' | 'resolvido'
export type DriverStatus = 'available' | 'on_route' | 'unavailable'
export type Priority     = 'alta' | 'media' | 'baixa'
export type DocStatus    = 'valido' | 'vence_em_breve' | 'vencido'

export type AlertType =
  | 'atraso_critico'
  | 'desvio_nao_autorizado'
  | 'parada_nao_planejada'
  | 'sinal_gps_intermitente'
  | 'tempo_parada_elevado'
  | 'entrega_fora_janela'
  | 'checklist_incompleto'

export type AlertSource = 'GPS' | 'Checklist' | 'Telemetria' | 'Manual'

// ===== Driver =====
export interface DriverDocument {
  type: string                    // CNH, Exame Toxicológico, Treinamento
  status: DocStatus
  expiresAt: Date
  issuedAt?: Date
}

export interface Driver {
  id: string
  code: string                    // MTR-7822
  name: string
  phone: string
  email?: string
  photoUrl?: string
  status: DriverStatus
  operationalScore: number        // 0-100
  plate: string
  vehicleType: string             // Van, Furgão, VUC
  base: string                    // CD São Paulo, CD Rio, etc
  documents: DriverDocument[]
  deliveriesToday: number
  avgDelayMinutes: number         // pode ser negativo (adiantado)
  lat: number
  lng: number
  address: string                 // texto da localização atual
}

// ===== Trip =====
export interface Trip {
  id: string
  code: string                    // KLP-9081
  driverId: string
  driverName: string
  driverPhoto?: string
  plate: string
  clientName: string              // Shopee, Magalu, Mercado Livre
  operationName: string           // ex: Last Mile SP
  routeCode: string               // ex: ROTA-SP-001
  priority: Priority
  origin: string
  destination: string
  originLat: number
  originLng: number
  destLat: number
  destLng: number
  windowStart: Date
  windowEnd: Date
  eta: Date
  departedAt?: Date
  arrivedAt?: Date
  status: TripStatus
  slaStatus: SlaStatus
  progressPct: number             // 0-100
  distanceTotal: number           // km
  distanceDone: number            // km
}

// ===== Alert =====
export interface Alert {
  id: string
  type: AlertType
  severity: AlertSeverity
  status: AlertStatus
  tripId: string
  tripCode: string
  driverId: string
  driverName: string
  driverPhoto?: string
  plate: string
  clientName: string
  routeCode: string
  title: string
  description: string
  source: AlertSource
  lat?: number
  lng?: number
  delayMinutes?: number
  deviationKm?: number
  occurredAt: Date
  slaDeadline?: Date
  assignedTo?: string
  resolvedAt?: Date
}

// ===== Timeline =====
export type TimelineEventKind = 'departure' | 'stop' | 'delivery' | 'alert' | 'arrival' | 'pending'

export interface TimelineEvent {
  id: string
  tripId: string
  kind: TimelineEventKind
  title: string
  description?: string
  occurredAt: Date
  isCompleted: boolean
  isCurrent: boolean
}

// ===== KPIs =====
export interface KPIDashboard {
  entregas:              { onTime: number; total: number; pct: number }
  sla:                   { pct: number; meta: number }
  motoristasEmRisco:     { count: number; total: number; sparkline: number[] }
  atrasosCriticos:       { count: number; total: number; sparkline: number[] }
  paradasNaoPlanejadas:  { count: number; total: number; sparkline: number[] }
}

export interface KPITorre {
  viagensAtivas:    { count: number; total: number }
  emRisco:          { count: number; total: number }
  atrasosCriticos:  { count: number; total: number }
  semSinal:         { count: number; total: number }
  ocorrencias:      { criticas: number; medias: number }
}

export interface KPIViagens {
  total:           { count: number }
  noPrazo:         { count: number; pct: number }
  emRisco:         { count: number; pct: number }
  atrasadas:       { count: number; pct: number }
  progressoMedio:  { pct: number }
}

export interface KPIMotoristas {
  ativos:             { count: number; total: number }
  disponiveis:        { count: number }
  emRota:             { count: number }
  comAtraso:          { count: number }
  documentosVencendo: { count: number }
}

export interface KPIAlertas {
  criticos:        { count: number }
  abertos:         { count: number }
  resolvidosHoje:  { count: number }
  slaTratativas:   { pct: number }   // gauge 0-100
}

// ===== Filters =====
export interface TripFilters {
  status?: TripStatus
  slaStatus?: SlaStatus
  clientName?: string
  driverName?: string
  priority?: Priority
  routeCode?: string
  search?: string
}

export interface DriverFilters {
  status?: DriverStatus
  base?: string
  search?: string
}

export interface AlertFilters {
  severity?: AlertSeverity
  status?: AlertStatus
  type?: AlertType
  clientName?: string
  routeCode?: string
  assignedTo?: string
  period?: 'today' | '7d' | '30d'
  search?: string
}
```

**2. Criar `torre-de-controle/src/data/mocks/drivers.ts`** com **10 motoristas** com dados completos. Use nomes brasileiros fictícios, placas inventadas (formato Mercosul AAA0A00 ou padrão antigo AAA-0000). Centralize uma data base para coerência:

```typescript
import type { Driver } from '@/data/types'

const today = new Date()
const daysFromNow = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d }
const monthsFromNow = (n: number) => { const d = new Date(today); d.setMonth(d.getMonth() + n); return d }

export const mockDrivers: Driver[] = [
  {
    id: 'drv-001', code: 'MTR-7822', name: 'Carlos Henrique Souza', phone: '(11) 98123-4501', email: 'carlos.souza@torre.fic',
    photoUrl: undefined, status: 'on_route', operationalScore: 94,
    plate: 'KLP-9081', vehicleType: 'Van', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                  status: 'valido',         expiresAt: monthsFromNow(11) },
      { type: 'Exame Toxicológico',   status: 'valido',         expiresAt: monthsFromNow(8) },
      { type: 'Treinamento Defensivo',status: 'vence_em_breve', expiresAt: daysFromNow(20) },
    ],
    deliveriesToday: 12, avgDelayMinutes: -3,
    lat: -23.5505, lng: -46.6333, address: 'Av. Paulista, 1500 — São Paulo/SP',
  },
  {
    id: 'drv-002', code: 'MTR-7841', name: 'Mariana Oliveira Lima', phone: '(11) 98223-7720', email: 'mariana.lima@torre.fic',
    status: 'on_route', operationalScore: 88,
    plate: 'JZS-4477', vehicleType: 'Furgão', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                  status: 'valido',         expiresAt: monthsFromNow(14) },
      { type: 'Exame Toxicológico',   status: 'vence_em_breve', expiresAt: daysFromNow(12) },
      { type: 'Treinamento Defensivo',status: 'valido',         expiresAt: monthsFromNow(6) },
    ],
    deliveriesToday: 9, avgDelayMinutes: 8,
    lat: -23.5870, lng: -46.6577, address: 'Rua Augusta, 2200 — São Paulo/SP',
  },
  {
    id: 'drv-003', code: 'MTR-7903', name: 'Roberto Almeida Pereira', phone: '(11) 99344-2210',
    status: 'on_route', operationalScore: 76,
    plate: 'PHQ-1023', vehicleType: 'VUC', base: 'CD Guarulhos',
    documents: [
      { type: 'CNH',                  status: 'valido',         expiresAt: monthsFromNow(20) },
      { type: 'Exame Toxicológico',   status: 'valido',         expiresAt: monthsFromNow(4) },
      { type: 'Treinamento Defensivo',status: 'vencido',        expiresAt: daysFromNow(-30) },
    ],
    deliveriesToday: 14, avgDelayMinutes: 22,
    lat: -23.4543, lng: -46.5331, address: 'Rod. Hélio Smidt — Guarulhos/SP',
  },
  {
    id: 'drv-004', code: 'MTR-8011', name: 'Juliana Costa Ribeiro', phone: '(11) 98777-6612',
    status: 'available', operationalScore: 96,
    plate: 'RFD-8821', vehicleType: 'Van', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                  status: 'valido',         expiresAt: monthsFromNow(18) },
      { type: 'Exame Toxicológico',   status: 'valido',         expiresAt: monthsFromNow(10) },
      { type: 'Treinamento Defensivo',status: 'valido',         expiresAt: monthsFromNow(7) },
    ],
    deliveriesToday: 0, avgDelayMinutes: -2,
    lat: -23.5613, lng: -46.6562, address: 'CD São Paulo — Vila Olímpia',
  },
  {
    id: 'drv-005', code: 'MTR-8055', name: 'Anderson Martins Silva', phone: '(11) 99001-3344',
    status: 'on_route', operationalScore: 82,
    plate: 'MJK-3392', vehicleType: 'Furgão', base: 'CD Campinas',
    documents: [
      { type: 'CNH',                  status: 'vence_em_breve', expiresAt: daysFromNow(25) },
      { type: 'Exame Toxicológico',   status: 'valido',         expiresAt: monthsFromNow(5) },
      { type: 'Treinamento Defensivo',status: 'valido',         expiresAt: monthsFromNow(9) },
    ],
    deliveriesToday: 8, avgDelayMinutes: 15,
    lat: -22.9099, lng: -47.0626, address: 'Av. Norte-Sul — Campinas/SP',
  },
  {
    id: 'drv-006', code: 'MTR-8120', name: 'Patricia Gomes Ferreira', phone: '(11) 98555-9907',
    status: 'on_route', operationalScore: 91,
    plate: 'XCV-7714', vehicleType: 'Van', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                  status: 'valido',         expiresAt: monthsFromNow(16) },
      { type: 'Exame Toxicológico',   status: 'valido',         expiresAt: monthsFromNow(11) },
      { type: 'Treinamento Defensivo',status: 'valido',         expiresAt: monthsFromNow(8) },
    ],
    deliveriesToday: 11, avgDelayMinutes: 4,
    lat: -23.5320, lng: -46.6291, address: 'Marginal Tietê — São Paulo/SP',
  },
  {
    id: 'drv-007', code: 'MTR-8201', name: 'Lucas Fernandes Cardoso', phone: '(11) 98112-4560',
    status: 'unavailable', operationalScore: 70,
    plate: 'NHB-6643', vehicleType: 'VUC', base: 'CD Guarulhos',
    documents: [
      { type: 'CNH',                  status: 'valido',         expiresAt: monthsFromNow(13) },
      { type: 'Exame Toxicológico',   status: 'vencido',        expiresAt: daysFromNow(-15) },
      { type: 'Treinamento Defensivo',status: 'valido',         expiresAt: monthsFromNow(5) },
    ],
    deliveriesToday: 0, avgDelayMinutes: 18,
    lat: -23.4322, lng: -46.4980, address: 'CD Guarulhos — Cumbica',
  },
  {
    id: 'drv-008', code: 'MTR-8255', name: 'Fernanda Rocha Mendes', phone: '(11) 99887-2245',
    status: 'on_route', operationalScore: 89,
    plate: 'TGY-2218', vehicleType: 'Van', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                  status: 'valido',         expiresAt: monthsFromNow(19) },
      { type: 'Exame Toxicológico',   status: 'valido',         expiresAt: monthsFromNow(9) },
      { type: 'Treinamento Defensivo',status: 'valido',         expiresAt: monthsFromNow(7) },
    ],
    deliveriesToday: 10, avgDelayMinutes: -1,
    lat: -23.5762, lng: -46.6395, address: 'Av. 9 de Julho — São Paulo/SP',
  },
  {
    id: 'drv-009', code: 'MTR-8302', name: 'Diego Barbosa Nunes', phone: '(11) 98443-8821',
    status: 'on_route', operationalScore: 84,
    plate: 'WPL-5532', vehicleType: 'Furgão', base: 'CD Campinas',
    documents: [
      { type: 'CNH',                  status: 'valido',         expiresAt: monthsFromNow(15) },
      { type: 'Exame Toxicológico',   status: 'valido',         expiresAt: monthsFromNow(6) },
      { type: 'Treinamento Defensivo',status: 'vence_em_breve', expiresAt: daysFromNow(18) },
    ],
    deliveriesToday: 7, avgDelayMinutes: 12,
    lat: -22.9550, lng: -47.0440, address: 'Rod. Anhanguera, km 95 — Campinas/SP',
  },
  {
    id: 'drv-010', code: 'MTR-8390', name: 'Beatriz Cunha Alves', phone: '(11) 98222-6677',
    status: 'available', operationalScore: 93,
    plate: 'QER-7090', vehicleType: 'Van', base: 'CD São Paulo',
    documents: [
      { type: 'CNH',                  status: 'valido',         expiresAt: monthsFromNow(17) },
      { type: 'Exame Toxicológico',   status: 'valido',         expiresAt: monthsFromNow(11) },
      { type: 'Treinamento Defensivo',status: 'valido',         expiresAt: monthsFromNow(10) },
    ],
    deliveriesToday: 0, avgDelayMinutes: 0,
    lat: -23.5505, lng: -46.6333, address: 'CD São Paulo — Vila Mariana',
  },
]
```

**3. Criar `torre-de-controle/src/data/mocks/trips.ts`** com **15 viagens distribuídas**: 8 in_progress (4 no_prazo / 2 em_risco / 1 atrasado / 1 sem_sinal), 3 planned, 3 completed, 1 delayed. Clientes: Shopee, Magazine Luiza, Mercado Livre, Amazon. Cada trip referencia driverId existente.

```typescript
import type { Trip } from '@/data/types'

const today = new Date()
const minutesFromNow = (m: number) => { const d = new Date(today); d.setMinutes(d.getMinutes() + m); return d }
const hoursFromNow = (h: number) => { const d = new Date(today); d.setHours(d.getHours() + h); return d }

export const mockTrips: Trip[] = [
  // === IN PROGRESS — NO PRAZO (4) ===
  {
    id: 'trp-001', code: 'VG-90211', driverId: 'drv-001', driverName: 'Carlos Henrique Souza',
    plate: 'KLP-9081', clientName: 'Shopee', operationName: 'Last Mile SP', routeCode: 'ROTA-SP-001',
    priority: 'alta',
    origin: 'CD Vila Olímpia', destination: 'Bairro Pinheiros',
    originLat: -23.5961, originLng: -46.6856, destLat: -23.5631, destLng: -46.6822,
    windowStart: hoursFromNow(-1), windowEnd: hoursFromNow(2), eta: hoursFromNow(1.2),
    departedAt: hoursFromNow(-1.5),
    status: 'in_progress', slaStatus: 'no_prazo',
    progressPct: 62, distanceTotal: 28.4, distanceDone: 17.6,
  },
  {
    id: 'trp-002', code: 'VG-90234', driverId: 'drv-002', driverName: 'Mariana Oliveira Lima',
    plate: 'JZS-4477', clientName: 'Magazine Luiza', operationName: 'Centro SP', routeCode: 'ROTA-SP-014',
    priority: 'media',
    origin: 'CD Tatuapé', destination: 'Centro de São Paulo',
    originLat: -23.5398, originLng: -46.5765, destLat: -23.5505, destLng: -46.6333,
    windowStart: hoursFromNow(-2), windowEnd: hoursFromNow(1.5), eta: hoursFromNow(0.8),
    departedAt: hoursFromNow(-2.2),
    status: 'in_progress', slaStatus: 'no_prazo',
    progressPct: 78, distanceTotal: 14.2, distanceDone: 11.1,
  },
  {
    id: 'trp-003', code: 'VG-90245', driverId: 'drv-006', driverName: 'Patricia Gomes Ferreira',
    plate: 'XCV-7714', clientName: 'Mercado Livre', operationName: 'Last Mile SP', routeCode: 'ROTA-SP-008',
    priority: 'media',
    origin: 'CD Vila Olímpia', destination: 'Moema',
    originLat: -23.5961, originLng: -46.6856, destLat: -23.5985, destLng: -46.6555,
    windowStart: hoursFromNow(-0.5), windowEnd: hoursFromNow(2.5), eta: hoursFromNow(1.5),
    departedAt: hoursFromNow(-0.8),
    status: 'in_progress', slaStatus: 'no_prazo',
    progressPct: 45, distanceTotal: 9.8, distanceDone: 4.4,
  },
  {
    id: 'trp-004', code: 'VG-90250', driverId: 'drv-008', driverName: 'Fernanda Rocha Mendes',
    plate: 'TGY-2218', clientName: 'Amazon', operationName: 'Express SP', routeCode: 'ROTA-SP-022',
    priority: 'baixa',
    origin: 'CD Vila Mariana', destination: 'Itaim Bibi',
    originLat: -23.5870, originLng: -46.6395, destLat: -23.5851, destLng: -46.6760,
    windowStart: hoursFromNow(-1.2), windowEnd: hoursFromNow(2), eta: hoursFromNow(1),
    departedAt: hoursFromNow(-1.4),
    status: 'in_progress', slaStatus: 'no_prazo',
    progressPct: 55, distanceTotal: 6.5, distanceDone: 3.6,
  },
  // === IN PROGRESS — EM RISCO (2) ===
  {
    id: 'trp-005', code: 'VG-90261', driverId: 'drv-005', driverName: 'Anderson Martins Silva',
    plate: 'MJK-3392', clientName: 'Shopee', operationName: 'Interior SP', routeCode: 'ROTA-CPS-003',
    priority: 'alta',
    origin: 'CD Campinas', destination: 'Sumaré',
    originLat: -22.9099, originLng: -47.0626, destLat: -22.8222, destLng: -47.2667,
    windowStart: hoursFromNow(-3), windowEnd: hoursFromNow(0.5), eta: hoursFromNow(0.7),
    departedAt: hoursFromNow(-3.2),
    status: 'in_progress', slaStatus: 'em_risco',
    progressPct: 84, distanceTotal: 31.2, distanceDone: 26.2,
  },
  {
    id: 'trp-006', code: 'VG-90274', driverId: 'drv-009', driverName: 'Diego Barbosa Nunes',
    plate: 'WPL-5532', clientName: 'Magazine Luiza', operationName: 'Interior SP', routeCode: 'ROTA-CPS-007',
    priority: 'media',
    origin: 'CD Campinas', destination: 'Indaiatuba',
    originLat: -22.9099, originLng: -47.0626, destLat: -23.0907, destLng: -47.2179,
    windowStart: hoursFromNow(-2.5), windowEnd: hoursFromNow(1), eta: hoursFromNow(1.2),
    departedAt: hoursFromNow(-2.7),
    status: 'in_progress', slaStatus: 'em_risco',
    progressPct: 70, distanceTotal: 22.4, distanceDone: 15.7,
  },
  // === IN PROGRESS — ATRASADO (1) ===
  {
    id: 'trp-007', code: 'VG-90288', driverId: 'drv-003', driverName: 'Roberto Almeida Pereira',
    plate: 'PHQ-1023', clientName: 'Shopee', operationName: 'Last Mile SP', routeCode: 'ROTA-GRU-002',
    priority: 'alta',
    origin: 'CD Guarulhos', destination: 'Aeroporto GRU',
    originLat: -23.4322, originLng: -46.4980, destLat: -23.4356, destLng: -46.4731,
    windowStart: hoursFromNow(-4), windowEnd: hoursFromNow(-0.5), eta: hoursFromNow(0.3),
    departedAt: hoursFromNow(-4.2),
    status: 'in_progress', slaStatus: 'atrasado',
    progressPct: 88, distanceTotal: 18.6, distanceDone: 16.4,
  },
  // === IN PROGRESS — SEM SINAL (1) ===
  {
    id: 'trp-008', code: 'VG-90299', driverId: 'drv-007', driverName: 'Lucas Fernandes Cardoso',
    plate: 'NHB-6643', clientName: 'Mercado Livre', operationName: 'Last Mile SP', routeCode: 'ROTA-GRU-005',
    priority: 'media',
    origin: 'CD Guarulhos', destination: 'Tatuapé',
    originLat: -23.4322, originLng: -46.4980, destLat: -23.5398, destLng: -46.5765,
    windowStart: hoursFromNow(-2), windowEnd: hoursFromNow(1.5), eta: hoursFromNow(1.4),
    departedAt: hoursFromNow(-2.1),
    status: 'in_progress', slaStatus: 'sem_sinal',
    progressPct: 40, distanceTotal: 24.0, distanceDone: 9.6,
  },
  // === PLANNED (3) ===
  {
    id: 'trp-009', code: 'VG-90310', driverId: 'drv-004', driverName: 'Juliana Costa Ribeiro',
    plate: 'RFD-8821', clientName: 'Amazon', operationName: 'Express SP', routeCode: 'ROTA-SP-031',
    priority: 'media',
    origin: 'CD Vila Mariana', destination: 'Vila Madalena',
    originLat: -23.5870, originLng: -46.6395, destLat: -23.5446, destLng: -46.6878,
    windowStart: hoursFromNow(2), windowEnd: hoursFromNow(5), eta: hoursFromNow(3.5),
    status: 'planned', slaStatus: 'no_prazo',
    progressPct: 0, distanceTotal: 8.4, distanceDone: 0,
  },
  {
    id: 'trp-010', code: 'VG-90315', driverId: 'drv-010', driverName: 'Beatriz Cunha Alves',
    plate: 'QER-7090', clientName: 'Shopee', operationName: 'Last Mile SP', routeCode: 'ROTA-SP-009',
    priority: 'alta',
    origin: 'CD Vila Mariana', destination: 'Brooklin',
    originLat: -23.5870, originLng: -46.6395, destLat: -23.6024, destLng: -46.6856,
    windowStart: hoursFromNow(3), windowEnd: hoursFromNow(6), eta: hoursFromNow(4.5),
    status: 'planned', slaStatus: 'no_prazo',
    progressPct: 0, distanceTotal: 12.8, distanceDone: 0,
  },
  {
    id: 'trp-011', code: 'VG-90322', driverId: 'drv-004', driverName: 'Juliana Costa Ribeiro',
    plate: 'RFD-8821', clientName: 'Magazine Luiza', operationName: 'Centro SP', routeCode: 'ROTA-SP-012',
    priority: 'baixa',
    origin: 'CD Vila Mariana', destination: 'Bela Vista',
    originLat: -23.5870, originLng: -46.6395, destLat: -23.5577, destLng: -46.6429,
    windowStart: hoursFromNow(5), windowEnd: hoursFromNow(8), eta: hoursFromNow(6),
    status: 'planned', slaStatus: 'no_prazo',
    progressPct: 0, distanceTotal: 5.2, distanceDone: 0,
  },
  // === COMPLETED (3) ===
  {
    id: 'trp-012', code: 'VG-90150', driverId: 'drv-001', driverName: 'Carlos Henrique Souza',
    plate: 'KLP-9081', clientName: 'Shopee', operationName: 'Last Mile SP', routeCode: 'ROTA-SP-001',
    priority: 'media',
    origin: 'CD Vila Olímpia', destination: 'Itaim Bibi',
    originLat: -23.5961, originLng: -46.6856, destLat: -23.5851, destLng: -46.6760,
    windowStart: hoursFromNow(-9), windowEnd: hoursFromNow(-6), eta: hoursFromNow(-7),
    departedAt: hoursFromNow(-9.5), arrivedAt: hoursFromNow(-7.2),
    status: 'completed', slaStatus: 'no_prazo',
    progressPct: 100, distanceTotal: 7.8, distanceDone: 7.8,
  },
  {
    id: 'trp-013', code: 'VG-90160', driverId: 'drv-002', driverName: 'Mariana Oliveira Lima',
    plate: 'JZS-4477', clientName: 'Mercado Livre', operationName: 'Centro SP', routeCode: 'ROTA-SP-014',
    priority: 'media',
    origin: 'CD Tatuapé', destination: 'Liberdade',
    originLat: -23.5398, originLng: -46.5765, destLat: -23.5577, destLng: -46.6356,
    windowStart: hoursFromNow(-8), windowEnd: hoursFromNow(-5), eta: hoursFromNow(-6),
    departedAt: hoursFromNow(-8.2), arrivedAt: hoursFromNow(-5.8),
    status: 'completed', slaStatus: 'no_prazo',
    progressPct: 100, distanceTotal: 11.6, distanceDone: 11.6,
  },
  {
    id: 'trp-014', code: 'VG-90175', driverId: 'drv-008', driverName: 'Fernanda Rocha Mendes',
    plate: 'TGY-2218', clientName: 'Amazon', operationName: 'Express SP', routeCode: 'ROTA-SP-022',
    priority: 'baixa',
    origin: 'CD Vila Mariana', destination: 'Pinheiros',
    originLat: -23.5870, originLng: -46.6395, destLat: -23.5631, destLng: -46.6822,
    windowStart: hoursFromNow(-7), windowEnd: hoursFromNow(-4), eta: hoursFromNow(-5),
    departedAt: hoursFromNow(-7.3), arrivedAt: hoursFromNow(-4.5),
    status: 'completed', slaStatus: 'no_prazo',
    progressPct: 100, distanceTotal: 9.0, distanceDone: 9.0,
  },
  // === DELAYED (1) ===
  {
    id: 'trp-015', code: 'VG-90180', driverId: 'drv-005', driverName: 'Anderson Martins Silva',
    plate: 'MJK-3392', clientName: 'Magazine Luiza', operationName: 'Interior SP', routeCode: 'ROTA-CPS-003',
    priority: 'alta',
    origin: 'CD Campinas', destination: 'Valinhos',
    originLat: -22.9099, originLng: -47.0626, destLat: -22.9716, destLng: -46.9959,
    windowStart: hoursFromNow(-6), windowEnd: hoursFromNow(-3), eta: hoursFromNow(-1),
    departedAt: hoursFromNow(-6.4), arrivedAt: hoursFromNow(-1.2),
    status: 'delayed', slaStatus: 'atrasado',
    progressPct: 100, distanceTotal: 13.2, distanceDone: 13.2,
  },
]
```

**4. Criar `torre-de-controle/src/data/mocks/alerts.ts`** com **15 alertas distribuídos**: 5 críticos, 6 médios, 4 baixos. Cobrir todos os AlertType. Referenciar tripIds e driverIds existentes:

```typescript
import type { Alert } from '@/data/types'

const today = new Date()
const minsAgo = (m: number) => { const d = new Date(today); d.setMinutes(d.getMinutes() - m); return d }
const minsFromNow = (m: number) => { const d = new Date(today); d.setMinutes(d.getMinutes() + m); return d }

export const mockAlerts: Alert[] = [
  // === CRÍTICOS (5) ===
  {
    id: 'alt-001', type: 'atraso_critico', severity: 'critico', status: 'aberto',
    tripId: 'trp-007', tripCode: 'VG-90288', driverId: 'drv-003', driverName: 'Roberto Almeida Pereira',
    plate: 'PHQ-1023', clientName: 'Shopee', routeCode: 'ROTA-GRU-002',
    title: 'Atraso crítico — janela ultrapassada',
    description: 'Veículo passou da janela de entrega há 30 min. Cliente notificado.',
    source: 'GPS', delayMinutes: 32, occurredAt: minsAgo(30), slaDeadline: minsFromNow(15),
    lat: -23.4356, lng: -46.4731,
  },
  {
    id: 'alt-002', type: 'desvio_nao_autorizado', severity: 'critico', status: 'aberto',
    tripId: 'trp-005', tripCode: 'VG-90261', driverId: 'drv-005', driverName: 'Anderson Martins Silva',
    plate: 'MJK-3392', clientName: 'Shopee', routeCode: 'ROTA-CPS-003',
    title: 'Desvio de rota não autorizado',
    description: 'Veículo a 4.2 km da rota planejada por mais de 8 minutos.',
    source: 'GPS', deviationKm: 4.2, occurredAt: minsAgo(8), slaDeadline: minsFromNow(20),
    lat: -22.8222, lng: -47.2667,
  },
  {
    id: 'alt-003', type: 'sinal_gps_intermitente', severity: 'critico', status: 'em_tratativa',
    tripId: 'trp-008', tripCode: 'VG-90299', driverId: 'drv-007', driverName: 'Lucas Fernandes Cardoso',
    plate: 'NHB-6643', clientName: 'Mercado Livre', routeCode: 'ROTA-GRU-005',
    title: 'Sinal GPS perdido há 12 min',
    description: 'Última posição: Av. Salim Farah Maluf. Sem reconexão.',
    source: 'Telemetria', occurredAt: minsAgo(12), slaDeadline: minsFromNow(10),
    assignedTo: 'op-001',
  },
  {
    id: 'alt-004', type: 'atraso_critico', severity: 'critico', status: 'aberto',
    tripId: 'trp-015', tripCode: 'VG-90180', driverId: 'drv-005', driverName: 'Anderson Martins Silva',
    plate: 'MJK-3392', clientName: 'Magazine Luiza', routeCode: 'ROTA-CPS-003',
    title: 'Entrega fora da janela cliente',
    description: 'Entrega concluída 1h12 após fechamento de janela.',
    source: 'GPS', delayMinutes: 72, occurredAt: minsAgo(75),
  },
  {
    id: 'alt-005', type: 'parada_nao_planejada', severity: 'critico', status: 'aberto',
    tripId: 'trp-006', tripCode: 'VG-90274', driverId: 'drv-009', driverName: 'Diego Barbosa Nunes',
    plate: 'WPL-5532', clientName: 'Magazine Luiza', routeCode: 'ROTA-CPS-007',
    title: 'Parada não planejada > 25 min',
    description: 'Veículo parado em via lateral fora de geofence.',
    source: 'GPS', occurredAt: minsAgo(25), slaDeadline: minsFromNow(35),
    lat: -23.0500, lng: -47.1800,
  },
  // === MÉDIOS (6) ===
  {
    id: 'alt-006', type: 'tempo_parada_elevado', severity: 'medio', status: 'aberto',
    tripId: 'trp-002', tripCode: 'VG-90234', driverId: 'drv-002', driverName: 'Mariana Oliveira Lima',
    plate: 'JZS-4477', clientName: 'Magazine Luiza', routeCode: 'ROTA-SP-014',
    title: 'Tempo elevado em ponto de entrega',
    description: 'Parado há 18 min no ponto. Threshold: 15 min.',
    source: 'GPS', occurredAt: minsAgo(18),
  },
  {
    id: 'alt-007', type: 'tempo_parada_elevado', severity: 'medio', status: 'aberto',
    tripId: 'trp-001', tripCode: 'VG-90211', driverId: 'drv-001', driverName: 'Carlos Henrique Souza',
    plate: 'KLP-9081', clientName: 'Shopee', routeCode: 'ROTA-SP-001',
    title: 'Velocidade média abaixo do esperado',
    description: 'Velocidade média 18 km/h vs prevista 32 km/h.',
    source: 'Telemetria', occurredAt: minsAgo(22),
  },
  {
    id: 'alt-008', type: 'desvio_nao_autorizado', severity: 'medio', status: 'aberto',
    tripId: 'trp-003', tripCode: 'VG-90245', driverId: 'drv-006', driverName: 'Patricia Gomes Ferreira',
    plate: 'XCV-7714', clientName: 'Mercado Livre', routeCode: 'ROTA-SP-008',
    title: 'Desvio menor de rota detectado',
    description: 'Veículo a 1.8 km da rota planejada.',
    source: 'GPS', deviationKm: 1.8, occurredAt: minsAgo(10),
  },
  {
    id: 'alt-009', type: 'parada_nao_planejada', severity: 'medio', status: 'em_tratativa',
    tripId: 'trp-004', tripCode: 'VG-90250', driverId: 'drv-008', driverName: 'Fernanda Rocha Mendes',
    plate: 'TGY-2218', clientName: 'Amazon', routeCode: 'ROTA-SP-022',
    title: 'Parada não planejada > 8 min',
    description: 'Parada em rua não cadastrada como ponto de entrega.',
    source: 'GPS', occurredAt: minsAgo(8), assignedTo: 'op-002',
  },
  {
    id: 'alt-010', type: 'sinal_gps_intermitente', severity: 'medio', status: 'aberto',
    tripId: 'trp-005', tripCode: 'VG-90261', driverId: 'drv-005', driverName: 'Anderson Martins Silva',
    plate: 'MJK-3392', clientName: 'Shopee', routeCode: 'ROTA-CPS-003',
    title: 'Sinal GPS intermitente',
    description: '3 perdas de sinal nas últimas 15 min.',
    source: 'Telemetria', occurredAt: minsAgo(5),
  },
  {
    id: 'alt-011', type: 'checklist_incompleto', severity: 'medio', status: 'aberto',
    tripId: 'trp-009', tripCode: 'VG-90310', driverId: 'drv-004', driverName: 'Juliana Costa Ribeiro',
    plate: 'RFD-8821', clientName: 'Amazon', routeCode: 'ROTA-SP-031',
    title: 'Checklist pré-viagem incompleto',
    description: '2 itens pendentes no checklist de saída.',
    source: 'Checklist', occurredAt: minsAgo(45),
  },
  // === BAIXOS (4) ===
  {
    id: 'alt-012', type: 'tempo_parada_elevado', severity: 'baixo', status: 'aberto',
    tripId: 'trp-001', tripCode: 'VG-90211', driverId: 'drv-001', driverName: 'Carlos Henrique Souza',
    plate: 'KLP-9081', clientName: 'Shopee', routeCode: 'ROTA-SP-001',
    title: 'Pequena parada não planejada',
    description: 'Parado por 5 min em sinal de trânsito.',
    source: 'GPS', occurredAt: minsAgo(40),
  },
  {
    id: 'alt-013', type: 'sinal_gps_intermitente', severity: 'baixo', status: 'resolvido',
    tripId: 'trp-002', tripCode: 'VG-90234', driverId: 'drv-002', driverName: 'Mariana Oliveira Lima',
    plate: 'JZS-4477', clientName: 'Magazine Luiza', routeCode: 'ROTA-SP-014',
    title: 'Falha breve de sinal GPS',
    description: 'Sinal recuperado em 1m20s.',
    source: 'Telemetria', occurredAt: minsAgo(120), resolvedAt: minsAgo(118),
  },
  {
    id: 'alt-014', type: 'checklist_incompleto', severity: 'baixo', status: 'resolvido',
    tripId: 'trp-012', tripCode: 'VG-90150', driverId: 'drv-001', driverName: 'Carlos Henrique Souza',
    plate: 'KLP-9081', clientName: 'Shopee', routeCode: 'ROTA-SP-001',
    title: 'Checklist preenchido com atraso',
    description: 'Concluído 3 min após prazo.',
    source: 'Checklist', occurredAt: minsAgo(540), resolvedAt: minsAgo(530),
  },
  {
    id: 'alt-015', type: 'tempo_parada_elevado', severity: 'baixo', status: 'aberto',
    tripId: 'trp-006', tripCode: 'VG-90274', driverId: 'drv-009', driverName: 'Diego Barbosa Nunes',
    plate: 'WPL-5532', clientName: 'Magazine Luiza', routeCode: 'ROTA-CPS-007',
    title: 'Velocidade reduzida em trecho',
    description: 'Velocidade média baixa em trecho de 2 km.',
    source: 'Telemetria', occurredAt: minsAgo(60),
  },
]
```

**4b. EXPANSÃO DE VOLUME — Após os arrays canonical acima, adicionar entradas geradas para atingir volume realista de paginação**

⚠️ Motivação: 15 trips / 15 alerts são insuficientes para testar comportamento de paginação e densidade operacional real. Target: 45 trips, 40 alerts, 22 drivers.

**Padrão de expansão para drivers.ts** — adicionar 12 drivers (drv-011 a drv-022) após os 10 canonical, seguindo o mesmo formato:

```typescript
// Adicionar ao array mockDrivers APÓS os 10 canonical (drv-001 a drv-010)
// Manter mesma estrutura de objetos. Distribuir: 6 on_route, 4 available, 2 unavailable
// Documentos: 1 driver com CNH vencida, 2 com Exame Tox vencendo em breve
// Bases: misturar CD Osasco e CD ABC entre os novos
// Exemplos de nomes fictícios adicionais: Rafael Torres, Amanda Vieira, Sandro Pires, 
// Leticia Nunes, Claudio Batista, Vanessa Carvalho, Renato Campos, Natalia Freitas, 
// Gustavo Santana, Eduardo Melo, Cecilia Rocha, Thiago Lima
// Emails devem usar domínio @torre.fic (ex: rafael.torres@torre.fic)
```

**Padrão de expansão para trips.ts** — renomear array para `canonicalTrips` e gerar 30 adicionais:

```typescript
// Renomear: const mockTrips → const canonicalTrips
// Adicionar APÓS o array canonical:

const driverPool = [
  { id: 'drv-001', name: 'Carlos Henrique Souza', plate: 'KLP-9081' },
  { id: 'drv-002', name: 'Mariana Oliveira Lima', plate: 'JZS-4477' },
  { id: 'drv-003', name: 'Roberto Almeida Pereira', plate: 'PHQ-1023' },
  { id: 'drv-005', name: 'Anderson Martins Silva', plate: 'MJK-3392' },
  { id: 'drv-006', name: 'Patricia Gomes Ferreira', plate: 'XCV-7714' },
  { id: 'drv-008', name: 'Fernanda Rocha Mendes', plate: 'TGY-2218' },
  { id: 'drv-009', name: 'Diego Barbosa Nunes', plate: 'WPL-5532' },
]

const clientPool = ['Shopee', 'Shopee', 'Magazine Luiza', 'Mercado Livre', 'Amazon'] as const

// Distribuição dos 30 extras:
// i 0-14: in_progress (10 no_prazo, 3 em_risco, 1 atrasado, 1 sem_sinal)
// i 15-20: planned (no_prazo)
// i 21-29: completed (no_prazo)

const generatedTrips: Trip[] = Array.from({ length: 30 }, (_, i): Trip => {
  const n = i + 16
  const drv = driverPool[i % driverPool.length]
  const client = clientPool[i % clientPool.length]
  const slaPool: SlaStatus[] = [
    'no_prazo','no_prazo','no_prazo','no_prazo','no_prazo',
    'no_prazo','no_prazo','no_prazo','no_prazo','no_prazo',
    'em_risco','em_risco','em_risco','atrasado','sem_sinal',
  ]
  const slaStatus: SlaStatus = i < 15 ? slaPool[i] : 'no_prazo'
  const tripStatus: TripStatus =
    i < 15 ? 'in_progress' :
    i < 21 ? 'planned' : 'completed'

  return {
    id: `trp-${String(n).padStart(3, '0')}`,
    code: `VG-${91000 + n}`,
    driverId: drv.id,
    driverName: drv.name,
    plate: drv.plate,
    clientName: client,
    operationName: 'Last Mile SP',
    routeCode: `ROTA-SP-${String((i % 20) + 10).padStart(3, '0')}`,
    priority: (['alta', 'media', 'baixa'] as const)[i % 3],
    origin: 'CD Vila Olímpia',
    destination: `Bairro ${['Pinheiros', 'Moema', 'Itaim', 'Perdizes', 'Brooklin'][i % 5]}`,
    originLat: -23.5961, originLng: -46.6856,
    destLat: -23.54 + (i * 0.008), destLng: -46.64 + (i * 0.007),
    windowStart: hoursFromNow(-2 - (i * 0.15)),
    windowEnd: hoursFromNow(2 + (i * 0.1)),
    eta: slaStatus === 'em_risco'
      ? hoursFromNow(2.2 + (i * 0.1))
      : hoursFromNow(1 + (i * 0.1)),
    departedAt: tripStatus !== 'planned' ? hoursFromNow(-2 - (i * 0.15)) : undefined,
    arrivedAt: tripStatus === 'completed' ? hoursFromNow(-0.5 - (i * 0.1)) : undefined,
    status: tripStatus,
    slaStatus,
    progressPct:
      tripStatus === 'planned' ? 0 :
      tripStatus === 'completed' ? 100 :
      Math.min(95, 20 + i * 2),
    distanceTotal: 8 + (i % 18),
    distanceDone:
      tripStatus === 'planned' ? 0 :
      tripStatus === 'completed' ? 8 + (i % 18) :
      Math.round((20 + i * 2) / 100 * (8 + i % 18)),
  }
})

export const mockTrips: Trip[] = [...canonicalTrips, ...generatedTrips]
// (Remover export do array canonicalTrips se existir)
```

**Padrão de expansão para alerts.ts** — renomear array para `canonicalAlerts` e gerar 25 adicionais:

```typescript
// Renomear: export const mockAlerts → const canonicalAlerts
// Adicionar APÓS:

const generatedAlerts: Alert[] = Array.from({ length: 25 }, (_, i): Alert => {
  const n = i + 16
  const severityPool: AlertSeverity[] = [
    'critico','critico','critico',           // 3 críticos
    'medio','medio','medio','medio','medio', // 5 médios
    'baixo','baixo',                         // 2 baixos
  ]
  const severity: AlertSeverity = severityPool[i % severityPool.length]
  const statusPool: AlertStatus[] = ['aberto','aberto','em_tratativa','resolvido']
  const typePool: AlertType[] = [
    'atraso_critico','desvio_nao_autorizado','parada_nao_planejada',
    'sinal_gps_intermitente','tempo_parada_elevado','entrega_fora_janela','checklist_incompleto',
  ]
  const tripIdx = (i % 8) + 1  // referencia trp-001 a trp-008
  const tripId = `trp-${String(tripIdx).padStart(3, '0')}`
  const tripCodes: Record<string, string> = {
    'trp-001':'VG-90211','trp-002':'VG-90234','trp-003':'VG-90245','trp-004':'VG-90250',
    'trp-005':'VG-90261','trp-006':'VG-90274','trp-007':'VG-90288','trp-008':'VG-90299',
  }
  const driverNames: Record<string, {id:string; name:string; plate:string; client:string; route:string}> = {
    'trp-001':{id:'drv-001', name:'Carlos Henrique Souza', plate:'KLP-9081', client:'Shopee', route:'ROTA-SP-001'},
    'trp-002':{id:'drv-002', name:'Mariana Oliveira Lima', plate:'JZS-4477', client:'Magazine Luiza', route:'ROTA-SP-014'},
    'trp-003':{id:'drv-006', name:'Patricia Gomes Ferreira', plate:'XCV-7714', client:'Mercado Livre', route:'ROTA-SP-008'},
    'trp-004':{id:'drv-008', name:'Fernanda Rocha Mendes', plate:'TGY-2218', client:'Amazon', route:'ROTA-SP-022'},
    'trp-005':{id:'drv-005', name:'Anderson Martins Silva', plate:'MJK-3392', client:'Shopee', route:'ROTA-CPS-003'},
    'trp-006':{id:'drv-009', name:'Diego Barbosa Nunes', plate:'WPL-5532', client:'Magazine Luiza', route:'ROTA-CPS-007'},
    'trp-007':{id:'drv-003', name:'Roberto Almeida Pereira', plate:'PHQ-1023', client:'Shopee', route:'ROTA-GRU-002'},
    'trp-008':{id:'drv-007', name:'Lucas Fernandes Cardoso', plate:'NHB-6643', client:'Mercado Livre', route:'ROTA-GRU-005'},
  }
  const d = driverNames[tripId]
  const alertType = typePool[i % typePool.length]

  return {
    id: `alt-${String(n).padStart(3, '0')}`,
    type: alertType,
    severity,
    status: statusPool[i % statusPool.length],
    tripId,
    tripCode: tripCodes[tripId],
    driverId: d.id,
    driverName: d.name,
    plate: d.plate,
    clientName: d.client,
    routeCode: d.route,
    title: `${['Alerta','Ocorrência','Exceção'][i % 3]} ${alertType.replace(/_/g,' ')} — ${d.name.split(' ')[0]}`,
    description: `Alerta gerado automaticamente para teste de volume. Viagem ${tripCodes[tripId]}.`,
    source: (['GPS','Telemetria','Checklist','Manual'] as const)[i % 4],
    delayMinutes: alertType === 'atraso_critico' ? 10 + (i * 3) : undefined,
    deviationKm: alertType === 'desvio_nao_autorizado' ? 1 + (i % 5) : undefined,
    occurredAt: minsAgo(5 + i * 8),
    resolvedAt: statusPool[i % statusPool.length] === 'resolvido' ? minsAgo(i * 4) : undefined,
  }
})

export const mockAlerts: Alert[] = [...canonicalAlerts, ...generatedAlerts]
// (Remover export do array canonicalAlerts se existir)
```

**5. Criar `torre-de-controle/src/data/mocks/kpis.ts`** com KPIs coerentes:

```typescript
import type {
  KPIDashboard, KPITorre, KPIViagens, KPIMotoristas, KPIAlertas,
} from '@/data/types'

export const kpisDashboard: KPIDashboard = {
  entregas:             { onTime: 77, total: 83, pct: 92.6 },
  sla:                  { pct: 92.6, meta: 95 },
  motoristasEmRisco:    { count: 4, total: 25, sparkline: [2, 3, 2, 4, 5, 3, 4] },
  atrasosCriticos:      { count: 2, total: 83, sparkline: [1, 0, 2, 3, 1, 2, 2] },
  paradasNaoPlanejadas: { count: 6, total: 83, sparkline: [3, 5, 4, 6, 7, 5, 6] },
}

export const kpisTorre: KPITorre = {
  viagensAtivas:    { count: 8, total: 83 },
  emRisco:          { count: 2, total: 8 },
  atrasosCriticos:  { count: 1, total: 8 },
  semSinal:         { count: 1, total: 8 },
  ocorrencias:      { criticas: 5, medias: 6 },
}

export const kpisViagens: KPIViagens = {
  total:           { count: 283 },
  noPrazo:         { count: 235, pct: 83.0 },
  emRisco:         { count: 28, pct: 9.9 },
  atrasadas:       { count: 20, pct: 7.1 },
  progressoMedio:  { pct: 64 },
}

export const kpisMotoristas: KPIMotoristas = {
  ativos:             { count: 25, total: 32 },
  disponiveis:        { count: 6 },
  emRota:             { count: 7 },
  comAtraso:          { count: 4 },
  documentosVencendo: { count: 3 },
}

export const kpisAlertas: KPIAlertas = {
  criticos:        { count: 5 },
  abertos:         { count: 12 },
  resolvidosHoje:  { count: 8 },
  slaTratativas:   { pct: 91 },
}
```

**6. Criar `torre-de-controle/src/data/mocks/timelineEvents.ts`** — eventos de timeline para algumas viagens (cobre trp-001, trp-005, trp-007 e trp-008 — usadas em paineis de detalhe das páginas):

```typescript
import type { TimelineEvent } from '@/data/types'

const today = new Date()
const hoursAgo = (h: number) => { const d = new Date(today); d.setHours(d.getHours() - h); return d }
const hoursFromNow = (h: number) => { const d = new Date(today); d.setHours(d.getHours() + h); return d }

export const mockTimelineByTrip: Record<string, TimelineEvent[]> = {
  'trp-001': [
    { id: 'tl-001-1', tripId: 'trp-001', kind: 'departure', title: 'Saída do CD Vila Olímpia', occurredAt: hoursAgo(1.5), isCompleted: true, isCurrent: false },
    { id: 'tl-001-2', tripId: 'trp-001', kind: 'stop', title: 'Parada em ponto de coleta', description: 'Parada de 8 min em ponto autorizado', occurredAt: hoursAgo(0.9), isCompleted: true, isCurrent: false },
    { id: 'tl-001-3', tripId: 'trp-001', kind: 'pending', title: 'Em rota para destino', description: 'ETA: 1h12 — Bairro Pinheiros', occurredAt: today, isCompleted: false, isCurrent: true },
    { id: 'tl-001-4', tripId: 'trp-001', kind: 'arrival', title: 'Entrega prevista', description: 'Bairro Pinheiros', occurredAt: hoursFromNow(1.2), isCompleted: false, isCurrent: false },
  ],
  'trp-005': [
    { id: 'tl-005-1', tripId: 'trp-005', kind: 'departure', title: 'Saída do CD Campinas', occurredAt: hoursAgo(3.2), isCompleted: true, isCurrent: false },
    { id: 'tl-005-2', tripId: 'trp-005', kind: 'alert', title: 'Alerta — desvio detectado', description: '4.2 km da rota planejada', occurredAt: hoursAgo(0.13), isCompleted: true, isCurrent: false },
    { id: 'tl-005-3', tripId: 'trp-005', kind: 'pending', title: 'Em rota — risco de atraso', description: 'ETA pode ultrapassar janela', occurredAt: today, isCompleted: false, isCurrent: true },
    { id: 'tl-005-4', tripId: 'trp-005', kind: 'arrival', title: 'Entrega prevista', description: 'Sumaré', occurredAt: hoursFromNow(0.7), isCompleted: false, isCurrent: false },
  ],
  'trp-007': [
    { id: 'tl-007-1', tripId: 'trp-007', kind: 'departure', title: 'Saída do CD Guarulhos', occurredAt: hoursAgo(4.2), isCompleted: true, isCurrent: false },
    { id: 'tl-007-2', tripId: 'trp-007', kind: 'stop', title: 'Parada em ponto de coleta', occurredAt: hoursAgo(2.5), isCompleted: true, isCurrent: false },
    { id: 'tl-007-3', tripId: 'trp-007', kind: 'alert', title: 'Janela de entrega ultrapassada', description: '+30 min após fechamento', occurredAt: hoursAgo(0.5), isCompleted: true, isCurrent: false },
    { id: 'tl-007-4', tripId: 'trp-007', kind: 'pending', title: 'Aproximação do destino', description: 'Aeroporto GRU', occurredAt: today, isCompleted: false, isCurrent: true },
  ],
  'trp-008': [
    { id: 'tl-008-1', tripId: 'trp-008', kind: 'departure', title: 'Saída do CD Guarulhos', occurredAt: hoursAgo(2.1), isCompleted: true, isCurrent: false },
    { id: 'tl-008-2', tripId: 'trp-008', kind: 'alert', title: 'Sinal GPS perdido', description: 'Última posição: Av. Salim Farah Maluf', occurredAt: hoursAgo(0.2), isCompleted: true, isCurrent: true },
    { id: 'tl-008-3', tripId: 'trp-008', kind: 'arrival', title: 'Entrega prevista', description: 'Tatuapé', occurredAt: hoursFromNow(1.4), isCompleted: false, isCurrent: false },
  ],
}
```

**7. Criar `torre-de-controle/src/data/mocks/index.ts`** — barrel:

```typescript
export { mockDrivers } from './drivers'
export { mockTrips } from './trips'
export { mockAlerts } from './alerts'
export { mockTimelineByTrip } from './timelineEvents'
export {
  kpisDashboard, kpisTorre, kpisViagens, kpisMotoristas, kpisAlertas,
} from './kpis'
```
  </action>
  <verify>
    <automated>cd torre-de-controle && npm run build && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `torre-de-controle/src/data/types.ts` contém literalmente `export interface Trip`
    - `torre-de-controle/src/data/types.ts` contém literalmente `export interface Driver`
    - `torre-de-controle/src/data/types.ts` contém literalmente `export interface Alert`
    - `torre-de-controle/src/data/types.ts` contém literalmente `export interface KPIDashboard`
    - `torre-de-controle/src/data/types.ts` contém literalmente `export interface TripFilters`
    - `torre-de-controle/src/data/types.ts` contém literalmente `'no_prazo' | 'em_risco' | 'atrasado' | 'sem_sinal'`
    - `torre-de-controle/src/data/types.ts` contém literalmente `'critico' | 'medio' | 'baixo'`
    - `torre-de-controle/src/data/types.ts` contém literalmente `atraso_critico`
    - `torre-de-controle/src/data/types.ts` contém literalmente `desvio_nao_autorizado`
    - `torre-de-controle/src/data/types.ts` contém literalmente `parada_nao_planejada`
    - `torre-de-controle/src/data/mocks/drivers.ts` contém pelo menos 22 ocorrências de `id: 'drv-`
    - `torre-de-controle/src/data/mocks/trips.ts` contém pelo menos 45 ocorrências de `id: 'trp-`
    - `torre-de-controle/src/data/mocks/trips.ts` contém literalmente `canonicalTrips` e `generatedTrips`
    - `torre-de-controle/src/data/mocks/trips.ts` contém literalmente `'in_progress'`, `'planned'`, `'completed'`, `'delayed'`
    - `torre-de-controle/src/data/mocks/alerts.ts` contém pelo menos 40 ocorrências de `id: 'alt-`
    - `torre-de-controle/src/data/mocks/alerts.ts` contém literalmente `canonicalAlerts` e `generatedAlerts`
    - `torre-de-controle/src/data/mocks/alerts.ts` contém literalmente `'critico'`, `'medio'`, `'baixo'`
    - `torre-de-controle/src/data/mocks/kpis.ts` contém literalmente `kpisDashboard`, `kpisTorre`, `kpisViagens`, `kpisMotoristas`, `kpisAlertas`
    - `torre-de-controle/src/data/mocks/timelineEvents.ts` contém literalmente `mockTimelineByTrip`
    - `torre-de-controle/src/data/mocks/index.ts` re-exporta todos os mocks
    - `npm run build && npx tsc --noEmit` exit 0
    - **SEGURANÇA:** `grep -r "dangerouslySetInnerHTML" torre-de-controle/src/data torre-de-controle/src/hooks` retorna vazio (0 ocorrências)
    - **SEGURANÇA:** Nenhum email real (@gmail/@hotmail/@outlook) em mock data — todos usam domínio `@torre.fic`
    - **SEGURANÇA:** Nenhum CPF/CNPJ real, token, chave de API ou senha nos arquivos de mock
  </acceptance_criteria>
  <done>Types completos, mocks com volume realista (10/15/15/timeline/kpis), tsc sem erros.</done>
</task>

<task type="auto">
  <name>Task 2: Hooks de dados (useTrips, useDrivers, useAlerts, useDashboardKPIs, useTripTimeline) com filtros funcionais</name>
  <files>torre-de-controle/src/hooks/useTrips.ts, torre-de-controle/src/hooks/useDrivers.ts, torre-de-controle/src/hooks/useAlerts.ts, torre-de-controle/src/hooks/useDashboardKPIs.ts, torre-de-controle/src/hooks/useTripTimeline.ts, torre-de-controle/src/hooks/index.ts</files>
  <read_first>
    - torre-de-controle/src/data/types.ts (criado em Task 1 — entender filters)
    - torre-de-controle/src/data/mocks/index.ts (criado em Task 1 — confirmar exports)
    - .planning/phases/01-ui-shell-design-system/01-RESEARCH.md (Pattern 4 — abstração que Phase 2 troca)
  </read_first>
  <action>
**Princípio:** Mesma assinatura `{ data, isLoading, isError, error, refetch }` que Phase 2 vai retornar com TanStack Query — consumidores não mudam. `isError` e `refetch` são incluídos agora para que as páginas já consumam a interface correta, evitando refactor em Phase 2.

**1. Criar `torre-de-controle/src/hooks/useTrips.ts`:**

```typescript
import { useMemo } from 'react'
import { mockTrips } from '@/data/mocks'
import type { Trip, TripFilters } from '@/data/types'

interface UseTripsReturn {
  data: Trip[]
  isLoading: false
  isError: false
  error: null
  refetch: () => void
}

export function useTrips(filters?: TripFilters): UseTripsReturn {
  const data = useMemo(() => {
    if (!filters) return mockTrips
    return mockTrips.filter(t =>
      (!filters.status     || t.status     === filters.status) &&
      (!filters.slaStatus  || t.slaStatus  === filters.slaStatus) &&
      (!filters.clientName || t.clientName === filters.clientName) &&
      (!filters.driverName || t.driverName.toLowerCase().includes(filters.driverName.toLowerCase())) &&
      (!filters.priority   || t.priority   === filters.priority) &&
      (!filters.routeCode  || t.routeCode  === filters.routeCode) &&
      (!filters.search     || (
        t.code.toLowerCase().includes(filters.search.toLowerCase()) ||
        t.driverName.toLowerCase().includes(filters.search.toLowerCase()) ||
        t.plate.toLowerCase().includes(filters.search.toLowerCase()) ||
        t.clientName.toLowerCase().includes(filters.search.toLowerCase())
      ))
    )
  }, [filters])

  return { data, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useTrip(id: string | null): { data: Trip | null; isLoading: false; isError: false; error: null; refetch: () => void } {
  const data = useMemo(() => id ? mockTrips.find(t => t.id === id) ?? null : null, [id])
  return { data, isLoading: false, isError: false, error: null, refetch: () => {} }
}
```

**2. Criar `torre-de-controle/src/hooks/useDrivers.ts`:**

```typescript
import { useMemo } from 'react'
import { mockDrivers } from '@/data/mocks'
import type { Driver, DriverFilters } from '@/data/types'

interface UseDriversReturn {
  data: Driver[]
  isLoading: false
  isError: false
  error: null
  refetch: () => void
}

export function useDrivers(filters?: DriverFilters): UseDriversReturn {
  const data = useMemo(() => {
    if (!filters) return mockDrivers
    return mockDrivers.filter(d =>
      (!filters.status || d.status === filters.status) &&
      (!filters.base   || d.base   === filters.base) &&
      (!filters.search || (
        d.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        d.code.toLowerCase().includes(filters.search.toLowerCase()) ||
        d.plate.toLowerCase().includes(filters.search.toLowerCase())
      ))
    )
  }, [filters])

  return { data, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useDriver(id: string | null): { data: Driver | null; isLoading: false; isError: false; error: null; refetch: () => void } {
  const data = useMemo(() => id ? mockDrivers.find(d => d.id === id) ?? null : null, [id])
  return { data, isLoading: false, isError: false, error: null, refetch: () => {} }
}
```

**3. Criar `torre-de-controle/src/hooks/useAlerts.ts`:**

```typescript
import { useMemo } from 'react'
import { mockAlerts } from '@/data/mocks'
import type { Alert, AlertFilters } from '@/data/types'

interface UseAlertsReturn {
  data: Alert[]
  isLoading: false
  isError: false
  error: null
  refetch: () => void
}

export function useAlerts(filters?: AlertFilters): UseAlertsReturn {
  const data = useMemo(() => {
    if (!filters) return mockAlerts
    return mockAlerts.filter(a =>
      (!filters.severity   || a.severity   === filters.severity) &&
      (!filters.status     || a.status     === filters.status) &&
      (!filters.type       || a.type       === filters.type) &&
      (!filters.clientName || a.clientName === filters.clientName) &&
      (!filters.routeCode  || a.routeCode  === filters.routeCode) &&
      (!filters.assignedTo || a.assignedTo === filters.assignedTo) &&
      (!filters.search     || (
        a.title.toLowerCase().includes(filters.search.toLowerCase()) ||
        a.driverName.toLowerCase().includes(filters.search.toLowerCase()) ||
        a.plate.toLowerCase().includes(filters.search.toLowerCase()) ||
        a.tripCode.toLowerCase().includes(filters.search.toLowerCase())
      ))
    )
  }, [filters])

  return { data, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useAlert(id: string | null): { data: Alert | null; isLoading: false; isError: false; error: null; refetch: () => void } {
  const data = useMemo(() => id ? mockAlerts.find(a => a.id === id) ?? null : null, [id])
  return { data, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useAlertsBySeverity(): {
  critico: Alert[]
  medio: Alert[]
  baixo: Alert[]
} {
  return useMemo(() => ({
    critico: mockAlerts.filter(a => a.severity === 'critico'),
    medio:   mockAlerts.filter(a => a.severity === 'medio'),
    baixo:   mockAlerts.filter(a => a.severity === 'baixo'),
  }), [])
}
```

**4. Criar `torre-de-controle/src/hooks/useDashboardKPIs.ts`:**

```typescript
import { kpisDashboard, kpisTorre, kpisViagens, kpisMotoristas, kpisAlertas } from '@/data/mocks'
import type { KPIDashboard, KPITorre, KPIViagens, KPIMotoristas, KPIAlertas } from '@/data/types'

export function useDashboardKPIs(): { data: KPIDashboard; isLoading: false; isError: false; error: null; refetch: () => void } {
  return { data: kpisDashboard, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useTorreKPIs(): { data: KPITorre; isLoading: false; isError: false; error: null; refetch: () => void } {
  return { data: kpisTorre, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useViagensKPIs(): { data: KPIViagens; isLoading: false; isError: false; error: null; refetch: () => void } {
  return { data: kpisViagens, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useMotoristasKPIs(): { data: KPIMotoristas; isLoading: false; isError: false; error: null; refetch: () => void } {
  return { data: kpisMotoristas, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useAlertasKPIs(): { data: KPIAlertas; isLoading: false; isError: false; error: null; refetch: () => void } {
  return { data: kpisAlertas, isLoading: false, isError: false, error: null, refetch: () => {} }
}
```

**5. Criar `torre-de-controle/src/hooks/useTripTimeline.ts`:**

```typescript
import { useMemo } from 'react'
import { mockTimelineByTrip } from '@/data/mocks'
import type { TimelineEvent } from '@/data/types'

export function useTripTimeline(tripId: string | null): { data: TimelineEvent[]; isLoading: false; isError: false; error: null; refetch: () => void } {
  const data = useMemo(() => tripId ? (mockTimelineByTrip[tripId] ?? []) : [], [tripId])
  return { data, isLoading: false, isError: false, error: null, refetch: () => {} }
}
```

**6. Criar `torre-de-controle/src/hooks/index.ts`** — barrel:

```typescript
export { useTrips, useTrip } from './useTrips'
export { useDrivers, useDriver } from './useDrivers'
export { useAlerts, useAlert, useAlertsBySeverity } from './useAlerts'
export {
  useDashboardKPIs, useTorreKPIs, useViagensKPIs,
  useMotoristasKPIs, useAlertasKPIs,
} from './useDashboardKPIs'
export { useTripTimeline } from './useTripTimeline'
```
  </action>
  <verify>
    <automated>cd torre-de-controle && npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `torre-de-controle/src/hooks/useTrips.ts` contém literalmente `from '@/data/mocks'`
    - `torre-de-controle/src/hooks/useTrips.ts` contém literalmente `TripFilters`
    - `torre-de-controle/src/hooks/useTrips.ts` contém literalmente `isLoading: false`
    - `torre-de-controle/src/hooks/useTrips.ts` contém literalmente `isError: false`
    - `torre-de-controle/src/hooks/useTrips.ts` contém literalmente `error: null`
    - `torre-de-controle/src/hooks/useTrips.ts` contém literalmente `refetch: () => {}`
    - `torre-de-controle/src/hooks/useTrips.ts` contém literalmente `export function useTrip(`
    - `torre-de-controle/src/hooks/useDrivers.ts` contém literalmente `useDriver`
    - `torre-de-controle/src/hooks/useAlerts.ts` contém literalmente `useAlertsBySeverity`
    - `torre-de-controle/src/hooks/useDashboardKPIs.ts` contém literalmente `useTorreKPIs`
    - `torre-de-controle/src/hooks/useDashboardKPIs.ts` contém literalmente `useViagensKPIs`
    - `torre-de-controle/src/hooks/useDashboardKPIs.ts` contém literalmente `useMotoristasKPIs`
    - `torre-de-controle/src/hooks/useDashboardKPIs.ts` contém literalmente `useAlertasKPIs`
    - `torre-de-controle/src/hooks/useTripTimeline.ts` contém literalmente `mockTimelineByTrip`
    - `torre-de-controle/src/hooks/index.ts` re-exporta os 5 hooks principais e variantes singulares
    - `npm run build` exit 0
  </acceptance_criteria>
  <done>5 hooks principais + variantes (useTrip, useDriver, useAlert, useAlertsBySeverity), filtros funcionais, build passa.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| mock data → hook → JSX | Strings de mock data atravessam para UI |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-06 | Information Disclosure | Mock data | mitigate | Nomes/placas/CPFs fictícios — sem PII real (verificável: nomes não correspondem a pessoas reais; placas inventadas) |
| T-01-07 | Information Disclosure | Endereços/coordenadas | accept | Coordenadas usam pontos públicos genéricos (Av. Paulista etc) — sem residências privadas |

</threat_model>

<verification>
- `npm run build && npx tsc --noEmit` exit 0
- Todos hooks importáveis via `@/hooks`
- Filtros retornam subset esperado (validado por testes mentais sobre dados conhecidos)
</verification>

<success_criteria>
- [ ] types.ts cobre Trip, Driver, Alert, Timeline, todos KPIs, todos Filters
- [ ] mockDrivers >= 22 entradas, todos com documents completos
- [ ] mockTrips >= 45 entradas (15 canonical + 30 generated), distribuídos em 4 statuses + 4 slaStatus
- [ ] mockAlerts >= 40 entradas (15 canonical + 25 generated), distribuídos em 3 severities, cobrindo todos AlertType
- [ ] kpis.ts exporta 5 KPI objects coerentes com mocks
- [ ] mockTimelineByTrip cobre pelo menos 4 viagens
- [ ] 5 hooks principais com assinatura `{data, isLoading: false, isError: false, error: null, refetch: () => void}`
- [ ] Hooks suportam filtros (TripFilters, DriverFilters, AlertFilters)
- [ ] Dados mock: sem PII real, emails @torre.fic, sem dangerouslySetInnerHTML
- [ ] Build passa + tsc --noEmit exit 0
</success_criteria>

<output>
Após completion, criar `.planning/phases/01-ui-shell-design-system/01-03-SUMMARY.md` listando: types definidos, contagens dos mocks, hooks criados, build status.
</output>

## PLANNING COMPLETE
