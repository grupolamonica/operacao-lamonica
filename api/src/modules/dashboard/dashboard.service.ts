import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { redis } from '../../redis/client'

/**
 * KPIs do Dashboard (Phase 13) — paridade EXATA com o painel GAS.
 *
 * Universo = SNAPSHOT do painel (export "Monitoramento", trips.source='painel').
 * Total / Concluídas / No Prazo / Atrasadas vêm do Status JÁ COMPUTADO no export do painel
 * (contagem estática) → batem exatamente com o que o painel mostra. Re-importar o XLSX atualiza.
 *
 * Tickets Pendentes / Alertas: o export do painel não traz tickets; usamos os alertas do próprio
 * sistema (detectores). % No Prazo = noPrazo / (noPrazo + atrasadas).
 */
const TTL = 10
export type PeriodoSla = 'hoje' | '7d' | '30d' | 'tudo'

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

export async function getDashboardKpis(periodo: PeriodoSla = 'tudo'): Promise<DashboardKpis> {
  const key = `kpi:dashboard:${periodo}`
  try { const c = await redis.get(key); if (c) return JSON.parse(c) } catch { /* fall through */ }

  // Snapshot do painel: contagem estática (o Status do export já é a verdade do painel).
  const [tot] = (await db.execute(sql`
    SELECT
      count(*)::int                                      AS total,
      count(*) FILTER (WHERE status='completed')::int    AS concluidas,
      count(*) FILTER (WHERE sla_status='no_prazo')::int AS no_prazo,
      count(*) FILTER (WHERE sla_status='atrasado')::int AS atrasadas
    FROM trips
    WHERE source='painel'
  `)) as unknown as Array<{ total: number; concluidas: number; no_prazo: number; atrasadas: number }>

  const n = (v: unknown) => Number(v ?? 0)
  const total = n(tot?.total), concluidas = n(tot?.concluidas)
  const noPrazo = n(tot?.no_prazo), atrasadas = n(tot?.atrasadas)
  const aferidas = noPrazo + atrasadas
  const pctNoPrazo = aferidas > 0 ? Math.round((noPrazo / aferidas) * 1000) / 10 : 100

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
