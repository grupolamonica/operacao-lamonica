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

/**
 * Todas as cargas com `sheet_lh` (id, lh, sheet_status) — para enriquecer
 * trips.cargas_status na Torre via join por LH. Paginado.
 */
export async function fetchCargasLhStatus(): Promise<
  { id: string; lh: string; status: string | null }[]
> {
  const out: { id: string; lh: string; status: string | null }[] = []
  let from = 0
  while (true) {
    const { data, error } = await cargasSupabase
      .from('cargas')
      .select('id, sheet_lh, sheet_status')
      .not('sheet_lh', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as unknown as { id: string; sheet_lh: string | null; sheet_status: string | null }[]
    if (rows.length === 0) break
    for (const r of rows) if (r.sheet_lh) out.push({ id: r.id, lh: r.sheet_lh, status: r.sheet_status ?? null })
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

/** Carga completa (com sheet_lh) para virar trip na Torre (Onda A — cargas como fonte de viagens). */
export interface CargaTripRow {
  id: string
  sheet_lh: string | null
  sheet_status: string | null
  cliente_id: string | null
  origem: string | null
  destino: string | null
  perfil: string | null
  valor: number | string | null
  bonus: number | string | null
  sheet_motorista: string | null
  sheet_cavalo: string | null
  sheet_carreta: string | null
  status: string
  data: string | null
  duracao_horas: number | string | null
  booked_driver_id: string | null
}

export async function fetchAllCargasForTrips(): Promise<CargaTripRow[]> {
  const out: CargaTripRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await cargasSupabase
      .from('cargas')
      .select('id, sheet_lh, sheet_status, cliente_id, origem, destino, perfil, valor, bonus, sheet_motorista, sheet_cavalo, sheet_carreta, status, data, duracao_horas, booked_driver_id')
      .not('sheet_lh', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as unknown as CargaTripRow[]
    if (rows.length === 0) break
    out.push(...rows.filter((r) => r.sheet_lh))
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
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

/** Status de lead que representam alocação ATIVA (não-QUEUED, não-cancelada). */
export const ACTIVE_LEAD_STATUSES = ['APPROVED', 'WON_RESERVATION', 'PROMOTED', 'CONFIRMED', 'RESERVED'] as const

/** Cargas com motorista alocado (booked_driver_id preenchido). */
export async function fetchAllocatedLoadRows(): Promise<CargaRow[]> {
  const { data, error } = await cargasSupabase
    .from('cargas')
    .select(
      'id, cliente_id, origem, destino, perfil, valor, bonus, status, sheet_lh, sheet_status, sheet_motorista, sheet_cavalo, sheet_carreta, reserved_driver_id, booked_driver_id, distancia_km, rota_id',
    )
    .not('booked_driver_id', 'is', null)
  if (error) throw error
  return (data ?? []) as unknown as CargaRow[]
}

/** Leads ATIVOS (alocação vigente) por loadIds — o lead a cancelar no desalocar. */
export async function fetchActiveLeads(loadIds: string[]): Promise<PublicLeadRow[]> {
  if (loadIds.length === 0) return []
  const { data, error } = await cargasSupabase
    .from('load_public_leads')
    .select('id, load_id, cpf, phone, horse_plate, trailer_plate, vehicle_type, status')
    .in('load_id', loadIds)
    .in('status', ACTIVE_LEAD_STATUSES as unknown as string[])
  if (error) throw error
  return (data ?? []) as unknown as PublicLeadRow[]
}
