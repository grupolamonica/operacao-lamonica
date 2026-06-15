import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { redis } from '../../redis/client'
import { prazoRangeSql } from '../../lib/prazoRange'

/**
 * Insights aggregation service — 4 endpoints feed the InsightsPage analytics
 * dashboard (Wave 2 frontend). All functions cache results in Redis with key
 * prefix `kpi:insights:` and TTL = 30 s, matching the staleTime configured on
 * TanStack Query (CONTEXT D-29).
 *
 * O corte temporal é um intervalo de datas "Prazo Final" (inicio/fim, ambos
 * opcionais, 'YYYY-MM-DD') aplicado sobre trips.window_end (e occurred_at nos
 * alertas) via prazoRangeSql — réplica do checkVisibilityDate do painel legado.
 * SQL é parametrizado pelo template `sql` do Drizzle — sem vetor de injeção
 * (T-06.02-01).
 *
 * @see CONTEXT D-01 (4 metrics), D-29 (cache TTL)
 * @see RESEARCH Pattern 1 lines 250-294 — Insights aggregation SQL
 */

const CACHE_TTL = 30 // seconds (D-29)

// Pares from/to do translate() p/ strip de acentos no Postgres (mesma normalização do normalizeMotorista / drivers.service).
const ACC = "'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç','AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'"

export type PrazoRange = { inicio?: string | null; fim?: string | null }

function cacheKey(metric: string, range: PrazoRange, extra?: string): string {
  const window = `${range.inicio ?? ''}..${range.fim ?? ''}`
  return `kpi:insights:${metric}:${window}${extra ? ':' + extra : ''}`
}

export type SlaHistoryRow = {
  date:   string
  total:  number
  onTime: number
  sla:    number
}

export async function getSlaHistory({ inicio, fim }: PrazoRange = {}): Promise<SlaHistoryRow[]> {
  const key = cacheKey('sla-history', { inicio, fim })
  const cached = await redis.get(key)
  if (cached) {
    try { return JSON.parse(cached) as SlaHistoryRow[] } catch { /* fall through */ }
  }

  // SLA canônico (Onda E / D-14): no_prazo/(no_prazo+atrasado) sobre source='painel' — mesmo
  // universo do Dashboard (dashboard.service) e do sla_pct do BI. Não exige status='completed'
  // (o painel-sync grava concluídas com sla_status NULL — ficam fora da aferição).
  const rows = await db.execute(sql`
    SELECT
      TO_CHAR(DATE(window_end), 'YYYY-MM-DD') AS date,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE sla_status = 'no_prazo') AS on_time
    FROM trips
    WHERE source = 'painel'
      AND sla_status IN ('no_prazo', 'atrasado')
      AND (${prazoRangeSql(sql`window_end`, inicio, fim)})
    GROUP BY DATE(window_end)
    ORDER BY DATE(window_end) ASC
  `) as unknown as Array<{ date: string; total: number | string; on_time: number | string }>

  const result: SlaHistoryRow[] = rows.map(r => {
    const total  = Number(r.total)
    const onTime = Number(r.on_time)
    return {
      date:   r.date,
      total,
      onTime,
      sla:    total > 0 ? onTime / total : 0,
    }
  })

  await redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL)
  return result
}

export type DriverRankingRow = {
  driverId:    string
  name:        string
  code:        string
  score:       number
  slaPercent:  number
  avgDelayMin: number
  totalTrips:  number
}

export async function getDriversRanking(
  { inicio, fim }: PrazoRange = {},
  limit: number = 10,
): Promise<DriverRankingRow[]> {
  const key = cacheKey('drivers-ranking', { inicio, fim }, `limit=${limit}`)
  const cached = await redis.get(key)
  if (cached) {
    try { return JSON.parse(cached) as DriverRankingRow[] } catch { /* fall through */ }
  }

  // Clamp limit to safe bounds (defence in depth even though TypeBox already validates 1..50)
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 50)

  // Viagens vivas (painel/cargas) não têm driver_id — agrupa por sheet_motorista normalizado
  // (translate/upper, mesma lógica de drivers.service) e junta com drivers por nome p/ id/code/score
  // quando existir. Ranking = % no prazo canônico (no_prazo/(no_prazo+atrasado)) + volume, não
  // operational_score (só o seed escreve). Atraso médio via adiantamento_horas (+ = atrasado).
  const rows = await db.execute(sql`
    WITH viagens AS (
      SELECT
        upper(translate(trim(sheet_motorista), ${sql.raw(ACC)})) AS nome_norm,
        min(trim(sheet_motorista)) AS nome,
        COUNT(*) AS total_trips,
        COUNT(*) FILTER (WHERE sla_status = 'no_prazo') AS no_prazo,
        COUNT(*) FILTER (WHERE sla_status = 'atrasado') AS atrasadas,
        AVG(adiantamento_horas::numeric * 60) FILTER (
          WHERE sla_status = 'atrasado' AND adiantamento_horas IS NOT NULL AND adiantamento_horas::numeric > 0
        ) AS avg_delay_min
      FROM trips
      WHERE source IN ('painel', 'cargas')
        AND sheet_motorista IS NOT NULL AND trim(sheet_motorista) <> ''
        AND (${prazoRangeSql(sql`window_end`, inicio, fim)})
      GROUP BY 1
    )
    SELECT
      COALESCE(d.id::text, '')         AS driver_id,
      COALESCE(d.name, v.nome)         AS name,
      COALESCE(d.code, '')             AS code,
      COALESCE(d.operational_score, 0) AS score,
      v.total_trips,
      v.no_prazo,
      v.atrasadas,
      v.avg_delay_min
    FROM viagens v
    LEFT JOIN LATERAL (
      SELECT id, name, code, operational_score
      FROM drivers
      WHERE upper(translate(trim(name), ${sql.raw(ACC)})) = v.nome_norm
      ORDER BY id
      LIMIT 1
    ) d ON TRUE
    ORDER BY
      CASE WHEN v.no_prazo + v.atrasadas > 0
        THEN v.no_prazo::float / (v.no_prazo + v.atrasadas) ELSE 0 END DESC,
      v.total_trips DESC
    LIMIT ${safeLimit}
  `) as unknown as Array<{
    driver_id:     string
    name:          string
    code:          string
    score:         number | string
    total_trips:   number | string
    no_prazo:      number | string
    atrasadas:     number | string
    avg_delay_min: number | string | null
  }>

  const result: DriverRankingRow[] = rows.map(r => {
    const totalTrips = Number(r.total_trips)
    const noPrazo    = Number(r.no_prazo)
    const aferidas   = noPrazo + Number(r.atrasadas)
    const avgDelay   = r.avg_delay_min !== null && r.avg_delay_min !== undefined
      ? Number(r.avg_delay_min)
      : 0
    return {
      driverId:    r.driver_id,
      name:        r.name,
      code:        r.code,
      score:       Number(r.score),
      slaPercent:  aferidas > 0 ? noPrazo / aferidas : 0,
      avgDelayMin: Math.round(avgDelay * 10) / 10,
      totalTrips,
    }
  })

  await redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL)
  return result
}

export type ProblematicRouteRow = {
  routeId:    string
  code:       string
  name:       string
  alerts:     number
  avgDelay:   number
  slaPercent: number
}

export async function getProblematicRoutes({ inicio, fim }: PrazoRange = {}): Promise<ProblematicRouteRow[]> {
  const key = cacheKey('problematic-routes', { inicio, fim })
  const cached = await redis.get(key)
  if (cached) {
    try { return JSON.parse(cached) as ProblematicRouteRow[] } catch { /* fall through */ }
  }

  // Viagens vivas (painel/cargas) não têm route_id — agrupa pelo par (origin, destination).
  // Atrasos via sla_status='atrasado' + adiantamento_horas (+ = atrasado, em horas → min);
  // alertas juntam por trip_id (painel-sync linka tickets ao trip). SLA canônico por par.
  const rows = await db.execute(sql`
    WITH viagens AS (
      SELECT
        origin,
        destination,
        COUNT(*) AS total_trips,
        COUNT(*) FILTER (WHERE sla_status = 'no_prazo') AS no_prazo,
        COUNT(*) FILTER (WHERE sla_status = 'atrasado') AS atrasadas,
        AVG(adiantamento_horas::numeric * 60) FILTER (
          WHERE sla_status = 'atrasado' AND adiantamento_horas IS NOT NULL AND adiantamento_horas::numeric > 0
        ) AS avg_delay
      FROM trips
      WHERE source IN ('painel', 'cargas')
        AND origin IS NOT NULL AND trim(origin) <> ''
        AND destination IS NOT NULL AND trim(destination) <> ''
        AND (${prazoRangeSql(sql`window_end`, inicio, fim)})
      GROUP BY origin, destination
    ), alertas AS (
      SELECT
        tr.origin,
        tr.destination,
        COUNT(al.id) AS alert_count
      FROM alerts al
      JOIN trips tr ON tr.id = al.trip_id
      WHERE (${prazoRangeSql(sql`al.occurred_at`, inicio, fim)})
        AND tr.source IN ('painel', 'cargas')
        AND tr.origin IS NOT NULL AND tr.destination IS NOT NULL
      GROUP BY tr.origin, tr.destination
    )
    SELECT
      v.origin,
      v.destination,
      COALESCE(a.alert_count, 0) AS alert_count,
      COALESCE(v.avg_delay, 0)   AS avg_delay,
      v.total_trips,
      v.no_prazo,
      v.atrasadas
    FROM viagens v
    LEFT JOIN alertas a ON a.origin = v.origin AND a.destination = v.destination
    WHERE v.atrasadas > 0 OR COALESCE(a.alert_count, 0) > 0
    ORDER BY v.atrasadas DESC, COALESCE(a.alert_count, 0) DESC, v.total_trips DESC
    LIMIT 20
  `) as unknown as Array<{
    origin:      string
    destination: string
    alert_count: number | string
    avg_delay:   number | string
    total_trips: number | string
    no_prazo:    number | string
    atrasadas:   number | string
  }>

  const result: ProblematicRouteRow[] = rows.map(r => {
    const noPrazo  = Number(r.no_prazo)
    const aferidas = noPrazo + Number(r.atrasadas)
    const avgDelay = Number(r.avg_delay) || 0
    return {
      routeId:    `${r.origin}|${r.destination}`,
      code:       r.origin,
      name:       r.destination,
      alerts:     Number(r.alert_count),
      avgDelay:   Math.round(avgDelay * 10) / 10,
      slaPercent: aferidas > 0 ? noPrazo / aferidas : 0,
    }
  })

  await redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL)
  return result
}

export type AlertsDistributionRow = {
  type:  string
  count: number
}

export async function getAlertsDistribution({ inicio, fim }: PrazoRange = {}): Promise<AlertsDistributionRow[]> {
  const key = cacheKey('alerts-distribution', { inicio, fim })
  const cached = await redis.get(key)
  if (cached) {
    try { return JSON.parse(cached) as AlertsDistributionRow[] } catch { /* fall through */ }
  }

  const rows = await db.execute(sql`
    SELECT
      type,
      COUNT(*) AS count
    FROM alerts
    WHERE (${prazoRangeSql(sql`occurred_at`, inicio, fim)})
    GROUP BY type
    ORDER BY COUNT(*) DESC
  `) as unknown as Array<{ type: string; count: number | string }>

  const result: AlertsDistributionRow[] = rows.map(r => ({
    type:  r.type,
    count: Number(r.count),
  }))

  await redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL)
  return result
}
