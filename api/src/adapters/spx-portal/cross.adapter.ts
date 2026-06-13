/**
 * Phase 15 — cruzamento DINÂMICO: viagens Shopee EM ANDAMENTO (Torre) × SPX (aba asp).
 *
 * Para cada viagem Shopee `in_progress` na Torre (a LH vem do sistema de Cargas:
 * sheet_lh/linked_lh), busca a mesma viagem na API asp (live, principal da Shopee)
 * e cruza: por LH (chave principal) com fallback por placa do cavalo (cobre as
 * viagens Shopee sem LH preenchida). Marca `stale` quando a Torre ainda diz
 * EM ANDAMENTO mas o SPX já marcou concluído/chegou.
 *
 * Escopo é SÓ Shopee (clients.name = 'Shopee'); LH é código SPX/Shopee e a API
 * asp é Shopee por natureza — outros clientes (Casas Bahia, Nestlé, ...) não entram.
 */
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { fetchAspRows, type AspRow } from './asp.adapter'

const normPlate = (p: string) => (p || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const normName = (s: string) =>
  (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const CONCLUIDO_SPX = new Set(['Completed', 'Arrived', 'Unseal', 'Unloaded'])

interface TorreTrip {
  id: string
  code: string
  lh: string | null
  placa: string | null
  motorista: string | null
  eta: string | null
  status_eta: string | null
}

export interface CrossRow {
  lh: string | null
  code: string
  placa: string | null
  motorista: string | null
  torre_eta: string | null
  match_by: 'lh' | 'placa' | 'motorista' | null
  stale: boolean
  spx: {
    status: string
    status_operacional: string
    origem: string
    destino: string
    eta_destino_prog: string
    eta_destino_real: string
    placa: string
    motorista: string
  } | null
}

export interface CrossResult {
  total: number
  matched: number
  by_lh: number
  by_placa: number
  by_motorista: number
  sem_match: number
  stale: number
  rows: CrossRow[]
}

export async function crossReferenceShopeeInProgress(opts: { daysBack?: number; daysFwd?: number } = {}): Promise<CrossResult> {
  // 1. Viagens Shopee EM ANDAMENTO na Torre. A LH vem do sistema de Cargas (sheet_lh/linked_lh).
  //    Dedupe por LH (cargas + monitoramento duplicam a mesma viagem); preferindo a linha com placa.
  const trips = (await db.execute(sql`
    SELECT DISTINCT ON (COALESCE(t.sheet_lh, t.linked_lh, t.code))
      t.id,
      t.code,
      COALESCE(t.sheet_lh, t.linked_lh) AS lh,
      NULLIF(UPPER(REGEXP_REPLACE(COALESCE(t.sheet_cavalo, ''), '[^A-Za-z0-9]', '', 'g')), '') AS placa,
      t.sheet_motorista AS motorista,
      t.eta::text AS eta,
      t.status_eta
    FROM trips t
    JOIN clients c ON c.id = t.client_id
    WHERE t.status = 'in_progress' AND c.name = 'Shopee'
    ORDER BY COALESCE(t.sheet_lh, t.linked_lh, t.code), (t.sheet_cavalo IS NOT NULL) DESC
  `)) as unknown as TorreTrip[]

  // 2. Dados ao vivo do SPX (API da aba asp — principal da Shopee).
  const { rows: asp } = await fetchAspRows({ daysBack: opts.daysBack ?? 30, daysFwd: opts.daysFwd ?? 15 })
  const byLh = new Map<string, AspRow>()
  const byPlaca = new Map<string, AspRow>()
  const byDriver = new Map<string, AspRow[]>() // nome → linhas (usado só quando inequívoco)
  for (const r of asp) {
    if (r['LH Trip Number']) byLh.set(r['LH Trip Number'], r)
    for (const p of (r['Vehicle Plate Number'] || '').split(',').map(normPlate).filter(Boolean)) {
      if (!byPlaca.has(p)) byPlaca.set(p, r)
    }
    const nm = normName((r['Driver ID'] || '').replace(/^\[\d+\]/, ''))
    if (nm) (byDriver.get(nm) ?? byDriver.set(nm, []).get(nm)!).push(r)
  }

  // 3. Cruza por LH (principal) com fallback por placa do cavalo.
  const proj = (r: AspRow) => ({
    status: r['Status'],
    status_operacional: r['Status Operacional'],
    origem: r['Station_Origem'],
    destino: r['Station_Destino'],
    eta_destino_prog: r['ETA DESTINO PROGRAMADO'],
    eta_destino_real: r['ETA DESTINO REAL'],
    placa: r['Vehicle Plate Number'],
    motorista: (r['Driver ID'] || '').replace(/^\[\d+\]/, ''),
  })

  const rows: CrossRow[] = trips.map((t) => {
    let spx: AspRow | undefined = t.lh ? byLh.get(t.lh) : undefined
    let matchBy: 'lh' | 'placa' | 'motorista' | null = spx ? 'lh' : null
    if (!spx && t.placa) {
      spx = byPlaca.get(t.placa)
      if (spx) matchBy = 'placa'
    }
    if (!spx && t.motorista) {
      // Fallback por motorista — SÓ quando inequívoco (1 viagem desse motorista no SPX),
      // pra nunca casar errado.
      const cand = byDriver.get(normName(t.motorista))
      if (cand && cand.length === 1) {
        spx = cand[0]
        matchBy = 'motorista'
      }
    }
    return {
      lh: t.lh,
      code: t.code,
      placa: t.placa,
      motorista: t.motorista,
      torre_eta: t.eta,
      match_by: matchBy,
      stale: !!(spx && CONCLUIDO_SPX.has(spx['Status'])),
      spx: spx ? proj(spx) : null,
    }
  })

  return {
    total: rows.length,
    matched: rows.filter((o) => o.match_by).length,
    by_lh: rows.filter((o) => o.match_by === 'lh').length,
    by_placa: rows.filter((o) => o.match_by === 'placa').length,
    by_motorista: rows.filter((o) => o.match_by === 'motorista').length,
    sem_match: rows.filter((o) => !o.match_by).length,
    stale: rows.filter((o) => o.stale).length,
    rows,
  }
}
