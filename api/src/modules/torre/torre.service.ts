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

  // Tipos de ticket abertos no padrão do painel (D-14, 14-CONTEXT):
  //  Viagem Atrasada = ATRASO · Veículo Parado = PARADA · Viagem no Prazo = OK (in_progress no_prazo)
  //  Viagens ativas = em andamento / total · Ocorrências abertas = alerts não-terminais.
  const [tripRow] = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'in_progress')                                      AS ativas,
      count(*)                                                                            AS total,
      count(*) FILTER (WHERE status = 'in_progress' AND sla_status = 'no_prazo')          AS no_prazo
    FROM trips
  `) as unknown as Array<{ ativas: number; total: number; no_prazo: number }>

  const [alertRow] = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE lower(type) = 'atraso' AND status NOT IN ('resolvido','encerrado')) AS atrasadas,
      count(*) FILTER (WHERE lower(type) = 'parada' AND status NOT IN ('resolvido','encerrado')) AS paradas,
      count(*) FILTER (WHERE status NOT IN ('resolvido','encerrado'))                            AS abertas
    FROM alerts
  `) as unknown as Array<{ atrasadas: number; paradas: number; abertas: number }>

  const n = (v: unknown) => Number(v ?? 0)
  const t = tripRow ?? { ativas: 0, total: 0, no_prazo: 0 }
  const a = alertRow ?? { atrasadas: 0, paradas: 0, abertas: 0 }

  const kpis = {
    viagemAtrasada:     { count: n(a.atrasadas) },
    veiculoParado:      { count: n(a.paradas) },
    viagemNoPrazo:      { count: n(t.no_prazo) },
    viagensAtivas:      { count: n(t.ativas), total: n(t.total) },
    ocorrenciasAbertas: { count: n(a.abertas) },
  }

  await redis.set(KPI_CACHE_KEY, JSON.stringify(kpis), 'EX', KPI_CACHE_TTL)
  return kpis
}
