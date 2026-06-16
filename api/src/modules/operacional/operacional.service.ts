/**
 * Controle Operacional — réplica do painel da Shopee na Torre, SEM a planilha.
 *
 * A lógica do script da planilha (ASP→SHOPEE) é replicada aqui: a fonte é a SPX
 * (`fetchAspRows` = a aba "ASP"), e o STATUS operacional é RECONCILIADO a partir do
 * status SPX com as MESMAS regras do script:
 *   - NO SHOW / CTE EM EMISSÃO são intocáveis (a SPX não sobrescreve);
 *   - CANCELADO / DEVOLVIDO sempre propagam;
 *   - status de descarga só entram se já passou do CTE ENVIADO;
 *   - anti-regressão: não volta de CTE ENVIADO / descarga p/ estados anteriores.
 *
 * O status reconciliado fica PERSISTIDO por LH em op_status_override — e o operador
 * pode EDITAR pelo painel (é o "merge" dos dois status: um só, editável, com o status
 * cru da SPX exibido como referência). Cada mudança grava op_status_event (Log +
 * Últimas movimentações). A reconciliação automática roda no job a cada 2 min.
 */
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { fetchAspRows } from '../../adapters/spx-portal/asp.adapter'

const SPX_KEY = 'operacional:spx:v2'
const CACHE_TTL = 60 // s — SPX batida no máx. 1x/60s independente do polling do painel
const DAYS_BACK = 3
const DAYS_FWD = 7

// Status editáveis (os mesmos do painel/script).
export const OP_STATUSES = [
  'AGUARDANDO CHEGAR NO CLIENTE',
  'AGUARDANDO CARREGAMENTO',
  'CARREGADO',
  'CTE EM EMISSÃO',
  'CTE ENVIADO',
  'AGUARDANDO DESCARGA',
  'DESCARREGANDO',
  'DESCARREGADO',
  'NO SHOW',
  'CANCELADO',
  'DEVOLVIDO',
] as const
export type OpStatus = (typeof OP_STATUSES)[number]

const DESCARGA = ['AGUARDANDO DESCARGA', 'DESCARREGANDO', 'DESCARREGADO']
const PERMITEM_DESCARGA = ['CTE ENVIADO', 'AGUARDANDO DESCARGA', 'DESCARREGANDO']
const EXCECAO = ['CANCELADO', 'DEVOLVIDO']

/**
 * Reconciliação de status (réplica das regras do script da planilha). Decide o status
 * efetivo a partir do atual (persistido) e do novo (SPX). Estável: mesma entrada → mesma saída.
 */
export function reconcileStatus(atual: string, spx: string): string {
  const a = (atual || '').trim().toUpperCase()
  const n = (spx || '').trim().toUpperCase()
  if (!n) return atual // sem SPX → mantém
  if (!a) return spx // primeira vez → adota o status da SPX
  if (a === n) return atual
  if (a === 'NO SHOW' || a === 'CTE EM EMISSÃO') return atual // intocáveis
  if (EXCECAO.includes(n)) return spx // exceção sempre propaga
  if (DESCARGA.includes(n)) return PERMITEM_DESCARGA.includes(a) ? spx : atual // descarga só depois do CTE
  if (a !== 'CTE ENVIADO' && !DESCARGA.includes(a)) return spx // anti-regressão
  return atual
}

interface SpxTrip {
  lh: string
  spxStatus: string
  motorista: string
  cavalo: string
  carreta: string
  origem: string
  destino: string
  carregamento: string
  descarga: string
}

const stripBr = (s: string) => (s || '').replace(/\[.*?\]\s*/g, '').trim()
const driverName = (s: string) => (s || '').replace(/\[.*?\]\s*/, '').trim()

async function getSpxTrips(): Promise<SpxTrip[]> {
  const { redis } = await import('../../redis/client')
  try {
    const c = await redis.get(SPX_KEY)
    if (c) return JSON.parse(c) as SpxTrip[]
  } catch {
    /* segue p/ buscar */
  }
  const trips: SpxTrip[] = []
  try {
    const { rows } = await fetchAspRows({ queryTypes: [1, 2, 3], daysBack: DAYS_BACK, daysFwd: DAYS_FWD })
    const seen = new Set<string>()
    for (const r of rows) {
      const lh = (r['LH Trip Number'] || '').trim()
      if (!lh || seen.has(lh)) continue
      seen.add(lh)
      let spxStatus = r['Status Operacional'] || ''
      // 'Arrived' ambíguo: chegou na ORIGEM (sem saída real) = aguardando carregar
      if (r['Status'] === 'Arrived' && !(r['CPT ORIGEM REAL'] || '').trim()) spxStatus = 'AGUARDANDO CARREGAMENTO'
      const plates = (r['Vehicle Plate Number'] || '').split(',')
      const cavalo = (plates.shift() || '').trim()
      trips.push({
        lh,
        spxStatus,
        motorista: driverName(r['Driver ID']),
        cavalo,
        carreta: plates.join('/').trim(),
        origem: stripBr(r['Station_Origem']),
        destino: stripBr(r['Station_Destino']),
        carregamento: r['ETA ORIGEM PROGRAMADO'] || '',
        descarga: r['ETA DESTINO PROGRAMADO'] || '',
      })
    }
    try { await redis.set(SPX_KEY, JSON.stringify(trips), 'EX', CACHE_TTL) } catch { /* noop */ }
  } catch {
    /* SPX fora do ar → lista vazia (painel mostra vazio, não derruba) */
  }
  return trips
}

export interface OpViagem {
  lh: string
  carregamento: string
  descarga: string
  motorista: string
  origem: string
  destino: string
  cavalo: string
  carreta: string
  statusBase: string // status reconciliado persistido (= operacional)
  statusOperacional: string // = statusBase, editável (merge dos dois num só)
  statusShopee: string // status cru da SPX (referência, p/ ver divergência)
  overridden: boolean // editado manualmente pelo operador
  atualizadoEm: string | null
}

export interface OpEvent {
  lh: string
  status_operacional: string
  operador: string | null
  created_at: string
}

type Persisted = Map<string, { status: string; by: string | null; at: string }>

async function getPersisted(): Promise<Persisted> {
  const rows = (await db.execute(sql`
    SELECT lh, status_operacional, updated_by, updated_at FROM op_status_override
  `)) as unknown as Array<{ lh: string; status_operacional: string; updated_by: string | null; updated_at: string }>
  return new Map(rows.map((r) => [r.lh, { status: r.status_operacional, by: r.updated_by, at: r.updated_at }]))
}

export async function getOperacionalViagens(): Promise<OpViagem[]> {
  const [trips, persisted] = await Promise.all([getSpxTrips(), getPersisted()])
  const out: OpViagem[] = []
  for (const t of trips) {
    if (!t.motorista) continue // operação = viagens com motorista designado
    const p = persisted.get(t.lh)
    const eff = p?.status ?? t.spxStatus // persistido ?? inicial (SPX)
    if ((eff || '').toUpperCase() === 'DESCARREGADO') continue // concluído sai da lista
    out.push({
      lh: t.lh,
      carregamento: t.carregamento,
      descarga: t.descarga,
      motorista: t.motorista,
      origem: t.origem,
      destino: t.destino,
      cavalo: t.cavalo,
      carreta: t.carreta,
      statusBase: eff,
      statusOperacional: eff,
      statusShopee: t.spxStatus,
      overridden: !!(p && p.by && p.by !== 'SISTEMA'),
      atualizadoEm: p?.at ?? null,
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
 * Reconciliação automática (job a cada 2 min) — replica o loop do script: para cada viagem
 * com motorista, aplica reconcileStatus(persistido, SPX) e, quando muda, grava o novo
 * status persistido (op_status_override, 'SISTEMA') + um evento (op_status_event).
 * Edições manuais do operador (setOpStatus) são respeitadas pelas regras (locks/anti-regressão).
 * Leve: 1 leitura SPX (cache 60s) + 1 SELECT + upserts só do delta.
 */
export async function trackOpStatusTransitions(): Promise<{ checked: number; changed: number }> {
  const [trips, persisted] = await Promise.all([getSpxTrips(), getPersisted()])
  const changes: { lh: string; status: string }[] = []
  for (const t of trips) {
    if (!t.motorista) continue
    const cur = persisted.get(t.lh)?.status ?? ''
    const next = reconcileStatus(cur, t.spxStatus)
    if (next && next !== cur) changes.push({ lh: t.lh, status: next })
  }
  for (const c of changes) {
    await db.execute(sql`
      INSERT INTO op_status_override (lh, status_operacional, updated_by, updated_at)
      VALUES (${c.lh}, ${c.status}, 'SISTEMA', now())
      ON CONFLICT (lh) DO UPDATE
        SET status_operacional = ${c.status}, updated_by = 'SISTEMA', updated_at = now()
    `)
  }
  if (changes.length) {
    const values = changes.map((c) => sql`(${c.lh}, ${c.status}, 'SISTEMA')`)
    await db.execute(sql`
      INSERT INTO op_status_event (lh, status_operacional, operador)
      VALUES ${sql.join(values, sql`, `)}
    `)
  }
  return { checked: trips.length, changed: changes.length }
}
