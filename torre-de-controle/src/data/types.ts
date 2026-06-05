// ===== Enums / unions =====
export type RiskLevel = 'baixo' | 'medio' | 'alto' | 'critico'

export interface RiskFactor {
  key:          string
  label:        string
  weight:       number
  contribution: number
  detail?:      string
}

export interface RiskSnapshot {
  score:   number
  level:   RiskLevel
  factors: RiskFactor[]
}


export type SlaStatus = 'no_prazo' | 'em_risco' | 'atrasado' | 'sem_sinal'
export type TripStatus = 'planned' | 'in_progress' | 'completed' | 'delayed' | 'cancelled'
export type AlertSeverity = 'critico' | 'medio' | 'baixo'
export type AlertStatus = 'aberto' | 'em_analise' | 'em_tratativa' | 'resolvido' | 'encerrado'
export type DriverStatus = 'available' | 'on_route' | 'unavailable'
export type Priority = 'alta' | 'media' | 'baixa'
export type DocStatus = 'valido' | 'vence_em_breve' | 'vencido'

export type AlertType =
  | 'atraso_critico'
  | 'desvio_nao_autorizado'
  | 'parada_nao_planejada'
  | 'sinal_gps_intermitente'
  | 'tempo_parada_elevado'
  | 'entrega_fora_janela'
  | 'checklist_incompleto'
  // Phase 12 — taxonomia real Lamonica (detectores + histórico Angellira)
  | 'atraso'
  | 'parada'
  | 'sem_sinal'
  | 'prazo_proximo'
  | 'proximo_entrega'
  | 'manual'

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
  vehicleType: string             // Lamonica: TRUCK, CARRETA, CARRETA_EXPRESSA, BITREM
  base: string                    // CD São Paulo, CD Rio, etc
  documents: DriverDocument[]
  deliveriesToday: number
  avgDelayMinutes: number         // pode ser negativo (adiantado)
  lat: number
  lng: number
  address: string                 // texto da localização atual
  // Phase 12 — enriquecimento Lamonica (MH + Angellira), opcionais
  cpf?: string
  cnhCategoria?: string
  cnhValidade?: string
  cidade?: string
  estado?: string
  driverKind?: string             // FUN | AGR
  angelliraStatus?: string        // Conforme | Vencido | Não conforme
  documentsValid?: boolean
  anttValid?: boolean
  trackingEnabled?: boolean
  operationalBlocked?: boolean
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
  // Sprint 3 — delivery risk snapshot (nullable until first recalc)
  riskScore?: number | null
  riskLevel?: RiskLevel | null
  riskFactors?: RiskFactor[] | null
  // Phase 12 — financeiro (preço-padrão da rota, sistema Cargas)
  valor?: number | null
  bonus?: number | null
}

// ===== Alert =====
export interface Alert {
  id: string
  type: AlertType
  severity: AlertSeverity
  status: AlertStatus
  priority?: Priority
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
  // Sprint 2 — status & priority breakdown for ocorrências dashboard
  byStatus?:       { aberto: number; em_analise: number; em_tratativa: number; resolvido: number; encerrado: number }
  byPriority?:     { alta: number; media: number; baixa: number }
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
