/**
 * Controle Operacional — réplica do painel da Shopee/Cargas na Torre.
 *
 * FONTE = a MESMA planilha do sistema de cargas (CSV público). O STATUS exibido é
 * o da coluna STATUS de lá (não derivamos da SPX), e o GR vem das colunas CheckList
 * Cavalo/Carreta. A planilha é cacheada no Redis (60s) pra o polling do painel não
 * baixar o CSV a cada chamada. Mostramos a operação CORRENTE: janela ±3 dias em DATA
 * CARREGAMENTO, excluindo DESCARREGADO (concluído) e linhas sem status.
 *
 * STATUS EDITÁVEL: o operador pode sobrescrever o status no painel (override em
 * op_status_override, que vence sobre o da planilha). Cada alteração grava um evento
 * (op_status_event) que alimenta "Últimas movimentações" + "Log". O rastreador também
 * grava transições automáticas quando o status da planilha muda.
 */
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { fetchCargasSheet, parseBrDate, type SheetRow } from './cargas-sheet.adapter'
import { fetchAspRows } from '../../adapters/spx-portal/asp.adapter'

const CACHE_KEY = 'operacional:sheet:v1'
const SPX_KEY = 'operacional:spxmap:v1'
const CACHE_TTL = 60 // s — CSV/SPX batidos no máx. 1x/60s independente do polling do painel
const DAYS_BACK = 3
const DAYS_FWD = 3

// Status editáveis (os da planilha). DESCARREGADO/CANCELADO existem mas a operação
// corrente normalmente não fica neles; ainda assim o operador pode setar.
export const OP_STATUSES = [
  'AGUARDANDO CHEGAR NO CLIENTE',
  'AGUARDANDO CARREGAMENTO',
  'CARREGADO',
  'CTE EM EMISSÃO',
  'CTE ENVIADO',
  'DESCARREGANDO',
  'DESCARREGADO',
  'NO SHOW',
  'CANCELADO',
] as const
export type OpStatus = (typeof OP_STATUSES)[number]

export interface OpViagem {
  lh: string
  tipo: string // ForeCast / Spot / Tendência
  carregamento: string // DATA CARREGAMENTO (br)
  descarga: string // DATA DESCARGA (br)
  motorista: string
  origem: string
  destino: string
  cavalo: string
  carreta: string
  vinculo: string
  grCavalo: string // CheckList Cavalo (Aprovado/Vencido/...)
  grCarreta: string // CheckList Carreta1 (ou Carreta2)
  statusBase: string // STATUS da planilha (operacional)
  statusOperacional: string // override do operador ?? statusBase
  statusShopee: string // status da SPX (Shopee) p/ a mesma LH — read-only, p/ comparar
  overridden: boolean
  atualizadoEm: string | null // updated_at do override
}

export interface OpEvent {
  lh: string
  status_operacional: string
  operador: string | null
  created_at: string
}

async function getSheetCached(): Promise<SheetRow[]> {
  const { redis } = await import('../../redis/client')
  try {
    const cached = await redis.get(CACHE_KEY)
    if (cached) return JSON.parse(cached) as SheetRow[]
  } catch {
    /* cache miss / redis hiccup → busca direto */
  }
  const rows = await fetchCargasSheet()
  try {
    await redis.set(CACHE_KEY, JSON.stringify(rows), 'EX', CACHE_TTL)
  } catch {
    /* sem cache não é fatal */
  }
  return rows
}

/**
 * Status da SPX (Shopee) por LH — só p/ exibir ao lado do operacional (comparação).
 * Read-only, resiliente: se a SPX estiver indisponível, devolve mapa vazio (coluna
 * Shopee fica em branco) sem derrubar o painel. Cacheado 60s.
 */
async function getSpxStatusByLh(): Promise<Map<string, string>> {
  const { redis } = await import('../../redis/client')
  try {
    const cached = await redis.get(SPX_KEY)
    if (cached) return new Map(JSON.parse(cached) as [string, string][])
  } catch {
    /* segue p/ buscar */
  }
  try {
    const { rows } = await fetchAspRows({ queryTypes: [1, 2, 3], daysBack: 5, daysFwd: 5 })
    const m = new Map<string, string>()
    for (const r of rows) {
      const lh = (r['LH Trip Number'] || '').trim()
      if (!lh) continue
      let s = r['Status Operacional'] || ''
      // mesmo ajuste do 'Arrived' ambíguo (chegou na origem = aguardando carregar)
      if (r['Status'] === 'Arrived' && !(r['CPT ORIGEM REAL'] || '').trim()) s = 'AGUARDANDO CARREGAMENTO'
      m.set(lh, s)
    }
    try { await redis.set(SPX_KEY, JSON.stringify([...m]), 'EX', CACHE_TTL) } catch { /* noop */ }
    return m
  } catch {
    return new Map() // SPX fora do ar → coluna Shopee vazia, painel segue pela planilha
  }
}

export async function getOperacionalViagens(): Promise<OpViagem[]> {
  const [rows, spxByLh] = await Promise.all([getSheetCached(), getSpxStatusByLh()])
  const overrides = (await db.execute(sql`
    SELECT lh, status_operacional, updated_at FROM op_status_override
  `)) as unknown as Array<{ lh: string; status_operacional: string; updated_at: string }>
  const ovMap = new Map(overrides.map((o) => [o.lh, o]))

  const day = 86_400_000
  const now = Date.now()
  const lo = now - DAYS_BACK * day
  const hi = now + DAYS_FWD * day

  const seen = new Set<string>()
  const out: OpViagem[] = []
  for (const r of rows) {
    if (seen.has(r.lh)) continue
    const st = r.status.toUpperCase()
    // operação corrente: fora os concluídos e sem status
    if (!st || st === 'DESCARREGADO') continue
    const dt = parseBrDate(r.dataCarregamento)
    if (!dt || dt.getTime() < lo || dt.getTime() > hi) continue
    seen.add(r.lh)
    const ov = ovMap.get(r.lh)
    out.push({
      lh: r.lh,
      tipo: r.tipo,
      carregamento: r.dataCarregamento,
      descarga: r.dataDescarga,
      motorista: r.motorista,
      origem: r.origem,
      destino: r.destino,
      cavalo: r.cavalo,
      carreta: r.carreta,
      vinculo: r.vinculo,
      grCavalo: r.checklistCavalo,
      grCarreta: r.checklistCarreta1 || r.checklistCarreta2,
      statusBase: r.status,
      statusOperacional: ov?.status_operacional ?? r.status,
      statusShopee: spxByLh.get(r.lh) ?? '',
      overridden: ov != null,
      atualizadoEm: ov?.updated_at ?? null,
    })
  }
  return out
}

export async function setOpStatus(lh: string, status: string, operador: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO op_status_override (lh, status_operacional, updated_by, updated_at)
    VALUES (${lh}, ${status}, ${operador}, now())
    ON CONFLICT (lh) DO UPDATE
      SET status_operacional = ${status}, updated_by = ${operador}, updated_at = now()
  `)
  await db.execute(sql`
    INSERT INTO op_status_event (lh, status_operacional, operador)
    VALUES (${lh}, ${status}, ${operador})
  `)
}

export async function getMovimentacoes(limit = 12): Promise<OpEvent[]> {
  return (await db.execute(sql`
    SELECT lh, status_operacional, operador, created_at
    FROM op_status_event
    ORDER BY created_at DESC
    LIMIT ${limit}
  `)) as unknown as OpEvent[]
}

export async function getLhLog(lh: string): Promise<OpEvent[]> {
  return (await db.execute(sql`
    SELECT lh, status_operacional, operador, created_at
    FROM op_status_event
    WHERE lh = ${lh}
    ORDER BY created_at DESC
    LIMIT 50
  `)) as unknown as OpEvent[]
}

/**
 * Rastreador de transições — roda em background (job a cada 2min). Compara o status
 * operacional EFETIVO de cada viagem (override ?? derivado da SPX) com o último
 * conhecido (último op_status_event da viagem) e grava um evento 'SISTEMA' só pras
 * que mudaram. Assim o Log e as "Últimas movimentações" refletem as mudanças reais
 * da operação ao vivo, não só as edições manuais do operador.
 *
 * Leve: 1 leitura SPX (cache Redis 60s) + 1 SELECT + 1 INSERT em lote só do delta.
 * Na 1ª execução semeia o estado atual de todas (operador='SISTEMA' = "Início").
 */
export async function trackOpStatusTransitions(): Promise<{ checked: number; changed: number }> {
  const viagens = await getOperacionalViagens()
  const lastRows = (await db.execute(sql`
    SELECT DISTINCT ON (lh) lh, status_operacional
    FROM op_status_event
    ORDER BY lh, created_at DESC
  `)) as unknown as Array<{ lh: string; status_operacional: string }>
  const last = new Map(lastRows.map((r) => [r.lh, r.status_operacional]))

  const changed = viagens.filter((v) => v.statusOperacional && last.get(v.lh) !== v.statusOperacional)
  if (changed.length) {
    const values = changed.map((v) => sql`(${v.lh}, ${v.statusOperacional}, 'SISTEMA')`)
    await db.execute(sql`
      INSERT INTO op_status_event (lh, status_operacional, operador)
      VALUES ${sql.join(values, sql`, `)}
    `)
  }
  return { checked: viagens.length, changed: changed.length }
}
