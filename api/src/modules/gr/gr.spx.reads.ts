/**
 * Leitura da aba SPX / Shopee. Puxa do NOSSO banco (server-side):
 *  - sheet_monitor_snapshot / sheet_monitor_enriched via cargasSupabase (service_role)
 *  - driver_positions via o db do próprio Torre (última posição por placa)
 * NUNCA loga PII nem credenciais.
 */
import { cargasSupabase } from '../cargas/cargas.supabase'
import { db } from '../../db/client'
import { sql } from 'drizzle-orm'
import type { SpxSource } from './gr.spx.types'

/** Objeto bruto de uma viagem dentro de rows_json. */
export interface RawSnapRow {
  lh?: string
  data?: string
  horario?: string
  tipo?: string
  vinculo?: string
  motoristas?: string
  cavalo?: string
  carreta?: string
  origem?: string
  destino?: string
  status?: string
  checklistCavalo?: string
  checklistCarreta?: string
  hasDriver?: boolean
  isAvailable?: boolean
  // futuros (quando a ingestão carregar — a tela é tolerante e liga sozinha):
  checklistCavaloVenc?: number
  checklistCarretaVenc?: number
  /** data do espelhamento AL por cavalo (col M do doc, BaseCheckL!AB) — gap de ingestão. */
  espelhamentoAl?: string
}

export interface ShopeeSnapshot {
  rows: RawSnapRow[]
  syncedAt: string | null
}

/** Snapshot mais recente da operação (matriz por viagem). */
export async function fetchShopeeSnapshot(source: SpxSource = 'shopee'): Promise<ShopeeSnapshot> {
  const { data, error } = await cargasSupabase
    .from('sheet_monitor_snapshot')
    .select('rows_json, synced_at')
    .eq('source', source)
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const rows = data && Array.isArray(data.rows_json) ? (data.rows_json as unknown as RawSnapRow[]) : []
  return { rows, syncedAt: (data?.synced_at as string | null) ?? null }
}

export interface EnrichedRow {
  lh: string
  aspx_cpf: string | null
  /** motorista (col N do doc): found + validade — o status Apto/Vencido é DERIVADO da validade
   *  (angellira_driver_status_text existe mas está ~5% populado; a validade está ~85%). */
  angellira_driver_found: boolean | null
  angellira_driver_valid_until: string | null
  cavalo_angellira_status_text: string | null
  cavalo_angellira_valid_until: string | null
  carreta_angellira_status_text: string | null
  carreta_angellira_valid_until: string | null
}

const ENRICHED_COLS =
  'lh, aspx_cpf, angellira_driver_found, angellira_driver_valid_until, ' +
  'cavalo_angellira_status_text, cavalo_angellira_valid_until, ' +
  'carreta_angellira_status_text, carreta_angellira_valid_until'

/** Perfil Angellira (motorista/cavalo/carreta) + CPF por viagem (lh), em lotes. */
export async function fetchEnrichedByLh(lhs: string[]): Promise<Map<string, EnrichedRow>> {
  const out = new Map<string, EnrichedRow>()
  const uniq = [...new Set(lhs.filter((v): v is string => !!v))]
  const CHUNK = 200
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const chunk = uniq.slice(i, i + CHUNK)
    const { data, error } = await cargasSupabase
      .from('sheet_monitor_enriched')
      .select(ENRICHED_COLS)
      .in('lh', chunk)
    if (error) throw error
    for (const r of (data ?? []) as unknown as EnrichedRow[]) out.set(r.lh, r)
  }
  return out
}

/**
 * Última posição conhecida por placa (normalizada), dos últimos 30 dias — o SINAL
 * (telemetria) da matriz. driver_positions.veiculo = placa; data_posicao = timestamp.
 * É "última posição" (importada), não sinal do rastreador em tempo real.
 */
export async function fetchLastSignalByPlate(): Promise<Map<string, string>> {
  const rows = (await db.execute(sql`
    SELECT upper(regexp_replace(veiculo, '[^A-Za-z0-9]', '', 'g')) AS plate_norm,
           max(data_posicao) AS last_at
    FROM driver_positions
    WHERE veiculo IS NOT NULL
      AND data_posicao > now() - interval '30 days'
    GROUP BY 1
  `)) as unknown as Array<{ plate_norm: string; last_at: string | Date }>
  const map = new Map<string, string>()
  for (const r of rows) {
    if (r.plate_norm) map.set(r.plate_norm, new Date(r.last_at).toISOString())
  }
  return map
}
