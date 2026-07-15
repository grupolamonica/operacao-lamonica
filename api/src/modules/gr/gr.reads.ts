/**
 * Camada de LEITURA do GR — puxa as vigências de risco do Supabase de Cargas
 * (server-side, service_role), reusando o client do módulo cargas. O Cargas é a
 * fonte da verdade dos dados cadastrais de risco (Angellira/BRK/SPX); a Torre lê
 * e materializa um cache local (gr.sync). NUNCA loga linhas (PII) nem a key.
 */
import { cargasSupabase } from '../cargas/cargas.supabase'
import type { CargasDriverRiskRow, CargasVehicleRiskRow } from './gr.types'

const PAGE = 1000

const DRIVER_COLS =
  'user_id, full_name, document_number, ' +
  'angellira_status, angellira_valid_until, angellira_status_text, angellira_checked_at, ' +
  'brk_status, brk_conjunto_apto, brk_valid_until, brk_status_text, brk_checked_at, ' +
  'spx_vigency_status, spx_vigency_status_text, spx_vigency_encontrado, spx_vigency_checked_at'

const VEHICLE_COLS =
  'id, plate, plate_role, angellira_status, angellira_valid_until, ' +
  'angellira_status_text, angellira_checked_at, angellira_display_name, linked_driver_cpf'

/** Todos os driver_profiles do Cargas (colunas de risco), paginado. */
export async function fetchCargasDriverRisk(): Promise<CargasDriverRiskRow[]> {
  const out: CargasDriverRiskRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await cargasSupabase
      .from('driver_profiles')
      .select(DRIVER_COLS)
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as unknown as CargasDriverRiskRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

/** Todos os vehicles do Cargas (vigência Angellira por placa), paginado. */
export async function fetchCargasVehicleRisk(): Promise<CargasVehicleRiskRow[]> {
  const out: CargasVehicleRiskRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await cargasSupabase
      .from('vehicles')
      .select(VEHICLE_COLS)
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as unknown as CargasVehicleRiskRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}
