import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { redis } from '../../redis/client'

/**
 * KPIs do Dashboard — espelham a planilha do painel GAS (trips.source='painel', sync incremental 10min).
 * Total/Concluídas/No Prazo/Atrasadas: contagem estática do snapshot. Tickets/Alertas: do painel-sync (Redis).
 */
const TTL = 5
export type PeriodoSla = 'hoje' | '7d' | '30d' | 'tudo'

export interface DashboardKpis {
  filtroSla: PeriodoSla
  total: number; concluidas: number; noPrazo: number; atrasadas: number; aferidas: number
  pctNoPrazo: number; alertas: number; ticketsPendentes: number; motoristasEmRisco: number; meta: number
}

export async function getDashboardKpis(periodo: PeriodoSla = 'tudo'): Promise<DashboardKpis> {
  const key = `kpi:dashboard:${periodo}`
  try { const c = await redis.get(key); if (c) return JSON.parse(c) } catch { /* fall through */ }

  const [tot] = (await db.execute(sql`
    SELECT
      count(*)::int                                      AS total,
      count(*) FILTER (WHERE status='completed')::int    AS concluidas,
      count(*) FILTER (WHERE sla_status='no_prazo')::int AS no_prazo,
      count(*) FILTER (WHERE sla_status='atrasado')::int AS atrasadas
    FROM trips WHERE source='painel'
  `)) as unknown as Array<{ total: number; concluidas: number; no_prazo: number; atrasadas: number }>

  const n = (v: unknown) => Number(v ?? 0)
  const total = n(tot?.total), concluidas = n(tot?.concluidas)
  const noPrazo = n(tot?.no_prazo), atrasadas = n(tot?.atrasadas)
  const aferidas = noPrazo + atrasadas
  const pctNoPrazo = aferidas > 0 ? Math.round((noPrazo / aferidas) * 1000) / 10 : 100

  // Tickets Pendentes / Alertas calculados pelo painel-sync (Redis). Fallback p/ contagem de alerts.
  let ticketsPendentes = 0, alertas = 0
  try {
    const t = await redis.get('painel:tickets')
    if (t) { const o = JSON.parse(t); ticketsPendentes = n(o.ticketsPendentes); alertas = n(o.alertas) }
  } catch { /* noop */ }
  if (!ticketsPendentes || !alertas) {
    const [a] = (await db.execute(sql`
      SELECT count(*) FILTER (WHERE status IN ('aberto','em_analise','em_tratativa'))::int AS tp FROM alerts
    `)) as unknown as Array<{ tp: number }>
    if (!ticketsPendentes) ticketsPendentes = n(a?.tp)
    // Onda E / D-14: ocorrências abertas = não-terminais (igual ao card da Torre).
    if (!alertas) alertas = n(a?.tp)
  }

  const [d] = (await db.execute(sql`
    SELECT count(*) FILTER (WHERE status='on_route' AND avg_delay_minutes > 10)::int AS em_risco FROM drivers
  `)) as unknown as Array<{ em_risco: number }>

  const kpis: DashboardKpis = {
    filtroSla: periodo, total, concluidas, noPrazo, atrasadas, aferidas, pctNoPrazo,
    alertas, ticketsPendentes, motoristasEmRisco: n(d?.em_risco), meta: 95,
  }
  try { await redis.set(key, JSON.stringify(kpis), 'EX', TTL) } catch { /* noop */ }
  return kpis
}
