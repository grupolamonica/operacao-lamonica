/**
 * Controle Operacional — réplica do painel Shopee (Apps Script) na Torre.
 *
 * FONTE ÚNICA: a API SPX (aba "asp" via HTTP). As viagens exibidas vêm SÓ do
 * `fetchAspRows` (Planejado ∪ Aceito = operação corrente), nada do /api/trips.
 * O resultado do SPX é cacheado no Redis (60s) pra o polling do painel não
 * martelar a SPX.
 *
 * STATUS OPERACIONAL EDITÁVEL: o painel original deixa o operador alterar o
 * status. Aqui isso vira um OVERRIDE persistido (op_status_override) que vence
 * sobre o status derivado da SPX. Cada alteração grava um evento (op_status_event)
 * que alimenta as "Últimas movimentações" e o "Log" por viagem.
 */
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { fetchAspRows, type AspRow } from '../../adapters/spx-portal/asp.adapter'

const CACHE_KEY = 'operacional:asp:v1'
const CACHE_TTL = 60 // s — SPX é batido no máx. 1x/60s independente do polling do painel

// Status operacional editáveis. Inclui os derivados da SPX (de-para da aba asp)
// + os estados de CT-e que são geridos pelo operador (a SPX não os tem).
export const OP_STATUSES = [
  'AGUARDANDO CHEGAR NO CLIENTE',
  'AGUARDANDO CARREGAMENTO',
  'CARREGADO',
  'CTE EM EMISSÃO',
  'CTE ENVIADO',
  'AGUARDANDO DESCARGA',
  'DESCARREGANDO',
  'DESCARREGADO',
  'CANCELADO',
] as const
export type OpStatus = (typeof OP_STATUSES)[number]

export interface OpViagem {
  lh: string
  carregamento: string // ETA ORIGEM PROGRAMADO (br)
  descarga: string // ETA DESTINO PROGRAMADO (br)
  motorista: string
  motoristaId: string
  origem: string
  destino: string
  placa: string
  veiculo: string
  statusSpx: string // Status bruto da SPX (Departed, Arrived, ...)
  statusBase: string // Status Operacional derivado da SPX
  statusOperacional: string // override do operador ?? statusBase
  overridden: boolean
  atualizadoEm: string | null // updated_at do override
}

export interface OpEvent {
  lh: string
  status_operacional: string
  operador: string | null
  created_at: string
}

const stripStation = (s: string) => (s || '').replace(/^\[\d+\]/, '').trim()
function parseDriver(s: string): { id: string; nome: string } {
  const m = (s || '').match(/^\[(\d+)\]\s*(.*)$/)
  return m ? { id: m[1], nome: m[2].trim() } : { id: '', nome: (s || '').trim() }
}

async function getAspCached(): Promise<AspRow[]> {
  const { redis } = await import('../../redis/client')
  try {
    const cached = await redis.get(CACHE_KEY)
    if (cached) return JSON.parse(cached) as AspRow[]
  } catch {
    /* cache miss / redis hiccup → busca direto */
  }
  // Planejado(1) ∪ Aceito(2) = operação corrente (Concluído fica de fora, como no painel).
  // Janela curta (±2 dias) p/ refletir a operação do dia; "Aceito" ignora a janela na
  // SPX, então toda viagem em andamento entra independentemente da data.
  const { rows } = await fetchAspRows({ queryTypes: [1, 2], daysBack: 2, daysFwd: 2 })
  try {
    await redis.set(CACHE_KEY, JSON.stringify(rows), 'EX', CACHE_TTL)
  } catch {
    /* sem cache não é fatal */
  }
  return rows
}

export async function getOperacionalViagens(): Promise<OpViagem[]> {
  const asp = await getAspCached()
  const overrides = (await db.execute(sql`
    SELECT lh, status_operacional, updated_at FROM op_status_override
  `)) as unknown as Array<{ lh: string; status_operacional: string; updated_at: string }>
  const ovMap = new Map(overrides.map((o) => [o.lh, o]))

  const seen = new Set<string>()
  const out: OpViagem[] = []
  for (const r of asp) {
    const lh = (r['LH Trip Number'] || '').trim()
    if (!lh || seen.has(lh)) continue
    seen.add(lh)
    const d = parseDriver(r['Driver ID'])
    let base = r['Status Operacional'] || ''
    // 'Arrived' é ambíguo na SPX: chegou na ORIGEM (aguardando carregar) ou no DESTINO
    // (aguardando descarregar). O de-para da aba "asp" assume sempre destino. Corrige:
    // se ainda NÃO partiu da origem (sem saída real), está aguardando carregamento.
    if (r['Status'] === 'Arrived' && !(r['CPT ORIGEM REAL'] || '').trim()) {
      base = 'AGUARDANDO CARREGAMENTO'
    }
    const ov = ovMap.get(lh)
    out.push({
      lh,
      carregamento: r['ETA ORIGEM PROGRAMADO'] || '',
      descarga: r['ETA DESTINO PROGRAMADO'] || '',
      motorista: d.nome,
      motoristaId: d.id,
      origem: stripStation(r['Station_Origem']),
      destino: stripStation(r['Station_Destino']),
      placa: r['Vehicle Plate Number'] || '',
      veiculo: r['Vehicle'] || '',
      statusSpx: r['Status'] || '',
      statusBase: base,
      statusOperacional: ov?.status_operacional ?? base,
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
