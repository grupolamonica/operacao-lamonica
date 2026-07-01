/**
 * Tipos do módulo Cargas (Phase 14). Shapes brutos lidos do Supabase de Cargas
 * + shapes de resposta servidos pela Torre em /api/cargas/*.
 *
 * Tabelas reais confirmadas no DB de teste oklksqvrexiypectfsod (14-CONTEXT.md):
 * cargas, load_public_leads, clientes, motoristas_historico, sheet_monitor_enriched.
 */

// --- Raw rows (Cargas Supabase) ---

export interface CargaRow {
  id: string
  cliente_id: string | null
  origem: string | null
  destino: string | null
  perfil: string | null
  valor: number | string | null
  bonus: number | string | null
  status: string
  sheet_lh: string | null
  sheet_status: string | null
  sheet_motorista: string | null
  sheet_cavalo: string | null
  sheet_carreta: string | null
  reserved_driver_id: string | null
  booked_driver_id: string | null
  distancia_km: number | string | null
  rota_id: string | null
}

export interface PublicLeadRow {
  id: string
  load_id: string
  cpf: string | null
  phone: string | null
  horse_plate: string | null
  trailer_plate: string | null
  vehicle_type: string | null
  status: string
}

export interface ClienteRow {
  id: string
  nome: string
}

export interface MotoristaHistoricoRow {
  cpf: string
  nome: string | null
  driver_kind: string | null
}

// --- Response shapes (Torre /api/cargas/*) ---

/** Uma carga em aberto (sem motorista alocado). */
export interface OpenLoad {
  id: string
  lh: string | null
  cliente: string | null
  origem: string | null
  destino: string | null
  perfil: string | null
  valor: number | null
  bonus: number | null
  /** valor + bonus (Compensação na tela do Cargas). */
  compensacao: number | null
  status: string
  candidatesCount: number
}

/** Um candidato a uma carga (motorista que se candidatou no Cargas). */
export interface LoadCandidate {
  id: string
  /** Origem do candidato: 'lead' (load_public_leads) ou 'claim' (load_claims). */
  origin: 'lead' | 'claim'
  cpf: string | null
  /** Nome cruzado de motoristas_historico por CPF (null se não cadastrado). */
  nome: string | null
  horsePlate: string | null
  trailerPlate: string | null
  vehicleType: string | null
  status: string
}

/**
 * Motorista disponível para alocação avulsa (BUILD C). Disponível = sem trip
 * in_progress na Torre E fora da aba Bloqueados da planilha do painel. Sempre
 * com CPF (sem CPF o direct-allocation do Cargas rejeita).
 */
export interface AvailableDriver {
  name: string
  cpf: string
  phone: string | null
  /** FUN | AGR (driver_kind da Torre) ou Vinculo da aba DISPONIBILIDADE. */
  vinculo: string | null
  horsePlate: string | null
  trailerPlate: string | null
  /** Perfil canônico do Cargas (TRUCK|CARRETA|CARRETA_EXPRESSA|BITREM) inferido do VEICULO da planilha. */
  vehicleType: string | null
  disponivel: true
  /** 'planilha' quando o cavalo/carreta veio da aba DISPONIBILIDADE (curada à mão); senão 'torre'. */
  fonte: 'torre' | 'planilha'
}

/** Payload de alocação (write-back no Cargas). Um dos dois caminhos: */
export interface AllocateInput {
  /** Caminho (a): aprovar um lead QUEUED existente. */
  leadId?: string
  /** Caminho (b): alocar um motorista avulso (cria lead + reserva). */
  cpf?: string
  phone?: string
  horsePlate?: string
  trailerPlate?: string
  trailerPlate2?: string
  vehicleType?: string
}

/** Uma carga JÁ alocada (com motorista) + o lead ativo cancelável (p/ desalocar). */
export interface AllocatedLoad {
  id: string
  lh: string | null
  cliente: string | null
  origem: string | null
  destino: string | null
  perfil: string | null
  status: string
  /** lead ativo que prende a carga; null se não houver (ex.: alocação por claim). */
  leadId: string | null
  cpf: string | null
  driverName: string | null
  horsePlate: string | null
  trailerPlate: string | null
}

/** Payload de desalocação — cancela o lead (ou claim) que prende a carga. */
export interface DeallocateInput {
  leadId?: string
  claimId?: string
}
