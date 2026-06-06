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
  // No Prazo / Atrasadas de viagens ATIVAS: classificação ao vivo (chegada estimada vs prazo),
  // mesmo princípio do painel — ETA = agora + km_restante/65 (h); prazo = window_end + morosidade.
  // (Os tickets individuais usam a engine completa da lei do motorista; aqui é o proxy do dashboard.)
  const [t] = (await db.execute(sql`
    SELECT
      count(*)::int                                                                          AS total,
      count(*) FILTER (WHERE status='completed')::int                                        AS concluidas,
      count(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND window_end IS NOT NULL
        AND now() + make_interval(secs => 3600 * GREATEST(COALESCE(distance_total,0)-COALESCE(distance_done,0),0)/65.0)
            <= window_end + make_interval(secs => 3600 * COALESCE(morosidade_horas,0)))::int AS no_prazo,
      count(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND window_end IS NOT NULL
        AND now() + make_interval(secs => 3600 * GREATEST(COALESCE(distance_total,0)-COALESCE(distance_done,0),0)/65.0)
            > window_end + make_interval(secs => 3600 * COALESCE(morosidade_horas,0)))::int AS atrasadas
    FROM trips
    WHERE window_start >= ${cut}
  `)) as unknown as Array<{ total: number; concluidas: number; no_prazo: number; atrasadas: number }>

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
    total: n(t?.total), concluidas: n(t?.concluidas),
    noPrazo, atrasadas, aferidas, pctNoPrazo,
    alertas: n(a?.alertas), ticketsPendentes: n(a?.tickets_pendentes),
    motoristasEmRisco: n(d?.em_risco), meta: 95,
  }
  try { await redis.set(key, JSON.stringify(kpis), 'EX', TTL) } catch { /* noop */ }
  return kpis
}
