/**
 * Ranking domain types — ported 1:1 from the ride-rank app.
 *
 * Sources:
 *   - src/data/mockData.ts          → Driver/Trip/Block + enums (interfaces only)
 *   - src/services/sheetsService.ts → SheetTrip (raw DBLHHISTORICO CSV row)
 *   - src/services/routeScoreService.ts → RouteScoreRecord
 *   - src/services/supabaseService.ts   → *Record read shapes
 *
 * Only TYPES are ported here — no mock data, no UI helpers. The scoring layer
 * (ranking.scoring.ts) and the future read/service layers (Plans 03/04) consume
 * these. Re-exported by the Eden Treaty `App` type for the Phase 8 front-end.
 */

// --- Enums (mockData.ts) ---

export type DriverStatus = 'ATIVO' | 'BLOQUEADO';
export type Comunicacao = 'BOA' | 'REGULAR' | 'RUIM';
export type DesvioRota = 'NENHUM' | 'LEVE' | 'GRAVE';
export type Postura = 'OK' | 'RUIM';
export type BlockType = 'NO_SHOW' | 'MANUAL';

// --- Core domain (mockData.ts) ---

export interface StatusMetrics {
  onTime: number;
  early: number;
  delay: number;
}

export interface Driver {
  id: string;
  nome: string;
  status: DriverStatus;
  pontuacao: number;
  totalViagens: number;
  ocorrencias: number;
  created_at: string;
  etaOrigMetrics: StatusMetrics;
  etaDestMetrics: StatusMetrics;
  vinculo: string;
}

export interface Trip {
  id: string;
  driver_id: string;
  driverName: string;
  data: string;
  origin_code: string;
  destination_code: string;
  status_agrupado?: string;
  no_show_from_sheet?: boolean;
  source_sheet_field?: string;
  eta_origin_scheduled?: string;
  eta_origin_realized?: string;
  eta_origin_diff_minutes?: number | null;
  eta_destination_scheduled?: string;
  eta_destination_realized?: string;
  eta_destination_diff_minutes?: number | null;
  status_eta: string;
  status_eta_destino: string;
  status_cpt: string;
  ocorrencia: boolean;
  ocorrencia_count: number;
  ocorrencia_eta: string;
  ocorrencia_cpt: string;
  ocorrencia_eta_destino: string;
  score_final: number;
  evaluated: boolean;
}

export interface OperatorEvaluation {
  id: string;
  trip_id: string;
  comunicacao: Comunicacao;
  atendeu: boolean;
  desvio_rota: DesvioRota;
  postura: Postura;
  ajuste_manual: number;
  observacao: string;
  created_by: string;
  created_at: string;
}

export interface Block {
  id: string;
  driver_id: string;
  driverName: string;
  tipo: BlockType;
  motivo: string;
  ativo: boolean;
  data_inicio: string;
  data_fim: string | null;
  created_by: string;
}

// --- Raw Google Sheets row (sheetsService.ts) ---

export interface SheetTrip {
  sta_origin_date: string;
  trip_number: string;
  status_agrupado: string;
  solicitation_by: string;
  planned_vehicle: string;
  used_vehicle: string;
  used_agency_name: string;
  driver_id: string;
  driver_name: string;
  vehicle_number: string;
  origin_station_code: string;
  destination_station_code: string;
  eta_scheduled_origin_edited: string;
  cpt_scheduled_origin_edited: string;
  eta_destination_edited: string;
  id_rota: string;
  eta_realizado: string;
  status_eta: string;
  ocorrencia_eta: string;
  cpt_realizado: string;
  status_cpt: string;
  ocorrencia_cpt: string;
  eta_destino_realizado: string;
  status_eta_destino: string;
  ocorrencia_eta_destino: string;
  horario_de_descarga: string;
  sum_orders: string;
  checkin_origin_operator: string;
  checkout_origin_operator: string;
  checkin_destination_operator: string;
  eta_origin_realized: string;
  cpt_origin_realized: string;
  eta_destination_realized: string;
  atualizacao: string;
  [key: string]: string; // flexibility for unknown columns
}

// --- Route scores (routeScoreService.ts) ---

export interface RouteScoreRecord {
  id?: string;
  origin_code: string;
  destination_code: string;
  pontuacao: number;
  data_inicio: string;
  data_fim: string | null;
  observacao: string | null;
  created_at?: string;
  updated_at?: string;
}

// --- Supabase read shapes (supabaseService.ts) ---

export interface EvaluationRecord {
  id?: string;
  trip_id: string;
  driver_id: string;
  driver_name: string;
  comunicacao: string;
  atendeu: boolean;
  desvio_rota: string;
  postura: string;
  ajuste_manual: number;
  observacao: string;
  operador: string;
  created_at?: string;
  updated_at?: string;
}

export interface DriverBlockRecord {
  id?: string;
  driver_id: string;
  driver_name: string;
  tipo: string;
  motivo: string;
  ativo: boolean;
  manual_override: boolean;
  data_inicio?: string;
  data_fim?: string | null;
  created_by: string;
  updated_at?: string;
}

export interface EvaluationLogRecord {
  id?: string;
  trip_id?: string;
  driver_id?: string;
  driver_name?: string;
  operador: string;
  acao: string;
  dados_antes?: Record<string, unknown> | null;
  dados_depois?: Record<string, unknown> | null;
  created_at?: string;
}

export interface DriverRecord {
  id?: string;
  driver_id: string;
  driver_name: string;
  vinculo?: string | null;
}

// --- Vinculo (driver employment bond) — public Google Sheet (vinculoService.ts) ---

export interface VinculoRecord {
  motorista: string;
  vinculo: string;
}
