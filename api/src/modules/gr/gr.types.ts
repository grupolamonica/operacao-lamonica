/**
 * Tipos do módulo GR (Gerenciamento de Risco) — Torre.
 * Shapes brutos lidos do Supabase de Cargas (driver_profiles + vehicles) +
 * shapes de resposta servidos em /api/gr/*.
 */
import type { Verdict, Source } from './gr.risk-status'

// --- Raw rows (Cargas Supabase) ---

/** driver_profiles do Cargas — só as colunas de risco/identidade. */
export interface CargasDriverRiskRow {
  user_id: string
  full_name: string | null
  document_number: string | null
  angellira_status: string | null
  angellira_valid_until: string | null
  angellira_status_text: string | null
  angellira_checked_at: string | null
  brk_status: string | null
  brk_conjunto_apto: boolean | null
  brk_valid_until: string | null
  brk_status_text: string | null
  brk_checked_at: string | null
  // SPX-vigência (spx_vigency_*) ainda não existe no cargas de prod — fora do pull da v1.
}

/** vehicles do Cargas — placa + vigência Angellira + vínculo. */
export interface CargasVehicleRiskRow {
  id: string
  plate: string
  plate_role: string | null
  angellira_status: string | null
  angellira_valid_until: string | null
  angellira_status_text: string | null
  angellira_checked_at: string | null
  angellira_display_name: string | null
  linked_driver_cpf: string | null
}

// --- Response shapes (Torre /api/gr/*) ---

export type GrProvider = 'angellira' | 'brk' | 'spx'

export interface GrProviderStatus {
  provider: GrProvider
  status: string // OK | EXPIRING_SOON | EXPIRED | STATE
  rawStatus: string | null
  statusText: string | null
  validUntil: string | null
  daysUntilExpiry: number | null
  conjuntoApto: boolean | null
  checkedAt: string | null
}

export interface GrDriverView {
  cpf: string
  displayName: string | null
  verdict: Verdict
  reasons: Source[]
  providers: GrProviderStatus[]
}

export interface GrVehicleView {
  plate: string
  plateRole: string | null
  displayName: string | null
  linkedDriverCpf: string | null
  verdict: Verdict
  angellira: GrProviderStatus | null
}

export interface GrVerdictCounts {
  total: number
  ok: number
  atencao: number
  critico: number
  semDado: number
}

export interface GrOverview {
  drivers: GrVerdictCounts
  vehicles: GrVerdictCounts
  alertas: { total: number; criticos: number; atencao: number }
  lastSyncAt: string | null
}
