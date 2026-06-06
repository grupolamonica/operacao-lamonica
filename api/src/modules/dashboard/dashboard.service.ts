import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { redis } from '../../redis/client'

/**
 * KPIs do Dashboard (Phase 13) — paridade com o painel GAS.
 * Agregação 100% em SQL (sem carregar trips em memória, sem dados fake).
 *
 * Decisões (13-CONTEXT):
 *  - filtro de período (default 30d) sobre window_start.
 *  - % No Prazo = noPrazo / (noPrazo + atrasadas) das viagens ATIVAS com SLA aferido.
 *  - Alertas = exceções abertas de viagens ATIVAS; Tickets Pendentes = todos os abertos.
 */
const TTL = 30
export type PeriodoSla = 'hoje' | '7d' | '30d' | 'tudo'

function cutoff(p: PeriodoSla) {
  if (p === 'hoje') return sql`date_trunc('day', now())`
  if (p === '7d') return sql`now() - interval '7 days'`
  if (p === '30d') return sql`now() - interval '30 days'`
  return sql`'-infinity'::timestamptz`
}

export interface DashboardKpis {
  filtroSla: PeriodoSla
  total: number
  concluidas: number
  noPrazo: number
  atrasadas: number
  aferidas: number
  pctNoPrazo: number
  alertas: number
  ticketsPendentes: number
  motoristasEmRisco: number
  meta: number
}

export async function getDashboardKpis(periodo: PeriodoSla = '30d'): Promise<DashboardKpis> {
  const key = `kpi:dashboard:${periodo}`
  try { const c = await redis.get(key); if (c) return JSON.parse(c) } catch { /* fall through */ }

  const cut = cutoff(periodo)
  // Total / Concluídas: universo do período (window_start >= corte).
  const [tot] = (await db.execute(sql`
    SELECT
      count(*)::int                                   AS total,
      count(*) FILTER (WHERE status='completed')::int AS concluidas
    FROM trips
    WHERE window_start >= ${cut}
  `)) as unknown as Array<{ total: number; concluidas: number }>

  // No Prazo / Atrasadas: estado ATUAL das viagens ativas, classificado pelo sla_status que o
  // monitoring.adapter persiste com a lei do motorista (60 km/h, jornada 12h, prazo = previsaochegada)
  // — exatamente a mesma base do painel. Não filtra por período (é o "agora" operacional).
  const [t] = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE sla_status='no_prazo')::int AS no_prazo,
      count(*) FILTER (WHERE sla_status='atrasado')::int AS atrasadas
    FROM trips
    WHERE status NOT IN ('completed','cancelled')
  `)) as unknown as Array<{ no_prazo: number; atrasadas: number }>
  const total = tot?.total ?? 0, concluidas = tot?.concluidas ?? 0

  const [a] = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status IN ('aberto','em_analise','em_tratativa'))::int AS tickets_pendentes,
      count(*) FILTER (WHERE status IN ('aberto','em_analise','em_tratativa')
        AND trip_id IN (SELECT id FROM trips WHERE status NOT IN ('completed','cancelled')))::int AS alertas
    FROM alerts
  `)) as unknown as Array<{ tickets_pendentes: number; alertas: number }>

  const [d] = (await db.execute(sql`
    SELECT count(*) FILTER (WHERE status='on_route' AND avg_delay_minutes > 10)::int AS em_risco FROM drivers
  `)) as unknown as Array<{ em_risco: number }>

  const n = (v: unknown) => Number(v ?? 0)
  const noPrazo = n(t?.no_prazo), atrasadas = n(t?.atrasadas), aferidas = noPrazo + atrasadas
  const pctNoPrazo = aferidas > 0 ? Math.round((noPrazo / aferidas) * 1000) / 10 : 100

  const kpis: DashboardKpis = {
    filtroSla: periodo,
    total, concluidas,
    noPrazo, atrasadas, aferidas, pctNoPrazo,
    alertas: n(a?.alertas), ticketsPendentes: n(a?.tickets_pendentes),
    motoristasEmRisco: n(d?.em_risco), meta: 95,
  }
  try { await redis.set(key, JSON.stringify(kpis), 'EX', TTL) } catch { /* noop */ }
  return kpis
}
