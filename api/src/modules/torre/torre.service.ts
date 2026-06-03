import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { redis } from '../../redis/client'

const KPI_CACHE_KEY = 'kpi:torre'
const KPI_CACHE_TTL = 30

/**
 * KPIs da Torre de Controle (D-12-34).
 * Conjunto: viagens ativas, em risco, atrasos críticos, sem sinal, ocorrências.
 * Agregação SQL direta (9k+ trips) — não carrega tudo em memória como o dashboard legado.
 * Cache Redis 30s.
 */
export async function getTorreKpis() {
  const cached = await redis.get(KPI_CACHE_KEY)
  if (cached) {
    try { return JSON.parse(cached) } catch { /* fall through */ }
  }

  const [tripRow] = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'in_progress')                                      AS ativas,
      count(*)                                                                            AS total,
      count(*) FILTER (WHERE status = 'in_progress' AND sla_status = 'em_risco')          AS em_risco,
      count(*) FILTER (WHERE status = 'in_progress' AND sla_status = 'atrasado')          AS atrasados,
      count(*) FILTER (WHERE status = 'in_progress' AND sla_status = 'sem_sinal')         AS sem_sinal
    FROM trips
  `) as unknown as Array<{ ativas: number; total: number; em_risco: number; atrasados: number; sem_sinal: number }>

  const [alertRow] = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE severity = 'critico' AND status NOT IN ('resolvido','encerrado')) AS criticas,
      count(*) FILTER (WHERE severity = 'medio'   AND status NOT IN ('resolvido','encerrado')) AS medias
    FROM alerts
  `) as unknown as Array<{ criticas: number; medias: number }>

  const n = (v: unknown) => Number(v ?? 0)
  const t = tripRow ?? { ativas: 0, total: 0, em_risco: 0, atrasados: 0, sem_sinal: 0 }
  const a = alertRow ?? { criticas: 0, medias: 0 }

  const kpis = {
    viagensAtivas:   { count: n(t.ativas),    total: n(t.total) },
    emRisco:         { count: n(t.em_risco),  total: n(t.ativas) },
    atrasosCriticos: { count: n(t.atrasados), total: n(t.ativas) },
    semSinal:        { count: n(t.sem_sinal), total: n(t.ativas) },
    ocorrencias:     { criticas: n(a.criticas), medias: n(a.medias) },
  }

  await redis.set(KPI_CACHE_KEY, JSON.stringify(kpis), 'EX', KPI_CACHE_TTL)
  return kpis
}
