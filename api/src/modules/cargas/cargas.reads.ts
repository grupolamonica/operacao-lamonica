/**
 * Camada de LEITURA do Cargas (Supabase server-side, proxy — D-14-01).
 *
 * Espelha o padrão de ranking.reads.ts (paginação 1000). NUNCA loga linhas
 * (PII de motorista) nem a key. Tabelas confirmadas no DB de teste
 * oklksqvrexiypectfsod (14-CONTEXT.md).
 */

import { cargasSupabase } from './cargas.supabase'
import type {
  CargaRow,
  PublicLeadRow,
  ClienteRow,
  MotoristaHistoricoRow,
} from './cargas.types'

const PAGE = 1000

/** Cargas em aberto: status OPEN e sem motorista bookado (D-14: 52 no test). */
export async function fetchOpenLoadRows(): Promise<CargaRow[]> {
  const { data, error } = await cargasSupabase
    .from('cargas')
    .select(
      'id, cliente_id, origem, destino, perfil, valor, bonus, status, sheet_lh, sheet_status, sheet_motorista, sheet_cavalo, sheet_carreta, reserved_driver_id, booked_driver_id, distancia_km, rota_id',
    )
    .eq('status', 'OPEN')
    .is('booked_driver_id', null)
  if (error) throw error
  return (data ?? []) as unknown as CargaRow[]
}

/**
 * Candidatos (load_public_leads) por status QUEUED. Filtro opcional por loadIds.
 * Fonte real de candidatos no test (load_claims está vazio — D-14-04).
 */
export async function fetchQueuedLeads(loadIds?: string[]): Promise<PublicLeadRow[]> {
  let q = cargasSupabase
    .from('load_public_leads')
    .select('id, load_id, cpf, phone, horse_plate, trailer_plate, vehicle_type, status')
    .eq('status', 'QUEUED')
  if (loadIds && loadIds.length > 0) q = q.in('load_id', loadIds)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as PublicLeadRow[]
}

/** Todos os clientes (id → nome). Shopee + Nestle no test. */
export async function fetchClientes(): Promise<ClienteRow[]> {
  const { data, error } = await cargasSupabase.from('clientes').select('id, nome')
  if (error) throw error
  return (data ?? []) as unknown as ClienteRow[]
}

/** Motoristas (motoristas_historico) por lista de CPF — para cruzar nome/vínculo. */
export async function fetchMotoristasByCpf(cpfs: string[]): Promise<MotoristaHistoricoRow[]> {
  const unique = [...new Set(cpfs.filter(Boolean))]
  if (unique.length === 0) return []
  const out: MotoristaHistoricoRow[] = []
  for (let i = 0; i < unique.length; i += PAGE) {
    const chunk = unique.slice(i, i + PAGE)
    const { data, error } = await cargasSupabase
      .from('motoristas_historico')
      .select('cpf, nome, driver_kind')
      .in('cpf', chunk)
    if (error) throw error
    out.push(...((data ?? []) as unknown as MotoristaHistoricoRow[]))
  }
  return out
}
