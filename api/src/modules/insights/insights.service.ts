import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { redis } from '../../redis/client'

/**
 * Insights aggregation service — 4 endpoints feed the InsightsPage analytics
 * dashboard (Wave 2 frontend). All functions cache results in Redis with key
 * prefix `kpi:insights:` and TTL = 30 s, matching the staleTime configured on
 * TanStack Query (CONTEXT D-29).
 *
 * Range presets are whitelisted via TypeBox at the plugin layer (7d / 30d / 90d)
 * and converted to an integer at this layer. SQL is parameterised via the
 * Drizzle `sql` template — no SQL injection vector (T-06.02-01).
 *
 * @see CONTEXT D-01 (4 metrics), D-02 (range presets), D-29 (cache TTL)
 * @see RESEARCH Pattern 1 lines 250-294 — Insights aggregation SQL
 */

const CACHE_TTL = 30 // seconds (D-29)

export type Range = '7d' | '30d' | '90d'

function rangeDays(r: Range): number {
  return r === '7d' ? 7 : r === '90d' ? 90 : 30
}

function cacheKey(metric: string, range: Range, extra?: string): string {
  return `kpi:insights:${metric}:${range}${extra ? ':' + extra : ''}`
}

export type SlaHistoryRow = {
  date:   string
  total:  number
  onTime: number
  sla:    number
}

export async function getSlaHistory(range: Range = '30d'): Promise<SlaHistoryRow[]> {
  const key = cacheKey('sla-history', range)
  const cached = await redis.get(key)
  if (cached) {
    try { return JSON.parse(cached) as SlaHistoryRow[] } catch { /* fall through */ }
  }

  const days = rangeDays(range)
  const rows = await db.execute(sql`
    SELECT
      TO_CHAR(DATE(window_end), 'YYYY-MM-DD') AS date,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE sla_status = 'no_prazo') AS on_time
    FROM trips
    WHERE status = 'completed'
      AND window_end >= NOW() - (${days}::int * INTERVAL '1 day')
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
  range: Range = '30d',
  limit: number = 10,
): Promise<DriverRankingRow[]> {
  const key = cacheKey('drivers-ranking', range, `limit=${limit}`)
  const cached = await redis.get(key)
  if (cached) {
    try { return JSON.parse(cached) as DriverRankingRow[] } catch { /* fall through */ }
  }

  const days = rangeDays(range)
  // Clamp limit to safe bounds (defence in depth even though TypeBox already validates 1..50)
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 50)

  const rows = await db.execute(sql`
    SELECT
      d.id   AS driver_id,
      d.name AS name,
      d.code AS code,
      d.operational_score AS score,
      COUNT(t.id) AS total_trips,
      COUNT(*) FILTER (WHERE t.sla_status = 'no_prazo') AS on_time,
      AVG(
        CASE
          WHEN t.arrived_at IS NOT NULL AND t.arrived_at > t.window_end
            THEN EXTRACT(EPOCH FROM (t.arrived_at - t.window_end)) / 60.0
          ELSE NULL
        END
      ) AS avg_delay_min
    FROM drivers d
    LEFT JOIN trips t
      ON t.driver_id = d.id
     AND t.status = 'completed'
     AND t.window_end >= NOW() - (${days}::int * INTERVAL '1 day')
    GROUP BY d.id, d.name, d.code, d.operational_score
    HAVING COUNT(t.id) > 0
    ORDER BY d.operational_score DESC, COUNT(t.id) DESC
    LIMIT ${safeLimit}
  `) as unknown as Array<{
    driver_id:     string
    name:          string
    code:          string
    score:         number | string
    total_trips:   number | string
    on_time:       number | string
    avg_delay_min: number | string | null
  }>

  const result: DriverRankingRow[] = rows.map(r => {
    const totalTrips = Number(r.total_trips)
    const onTime     = Number(r.on_time)
    const avgDelay   = r.avg_delay_min !== null && r.avg_delay_min !== undefined
      ? Number(r.avg_delay_min)
      : 0
    return {
      driverId:    r.driver_id,
      name:        r.name,
      code:        r.code,
      score:       Number(r.score),
      slaPercent:  totalTrips > 0 ? onTime / totalTrips : 0,
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

export async function getProblematicRoutes(range: Range = '30d'): Promise<ProblematicRouteRow[]> {
  const key = cacheKey('problematic-routes', range)
  const cached = await redis.get(key)
  if (cached) {
    try { return JSON.parse(cached) as ProblematicRouteRow[] } catch { /* fall through */ }
  }

  const days = rangeDays(range)

  const rows = await db.execute(sql`
    SELECT
      r.id   AS route_id,
      r.code AS code,
      COALESCE(r.name, r.code) AS name,
      COALESCE(a.alert_count, 0) AS alert_count,
      COALESCE(a.avg_delay, 0)   AS avg_delay,
      COALESCE(t.total_trips, 0) AS total_trips,
      COALESCE(t.on_time, 0)     AS on_time
    FROM routes r
    LEFT JOIN (
      SELECT
        tr.route_id AS route_id,
        COUNT(al.id) AS alert_count,
        AVG(al.delay_minutes) FILTER (WHERE al.delay_minutes IS NOT NULL) AS avg_delay
      FROM alerts al
      JOIN trips tr ON tr.id = al.trip_id
      WHERE al.occurred_at >= NOW() - (${days}::int * INTERVAL '1 day')
        AND tr.route_id IS NOT NULL
      GROUP BY tr.route_id
    ) a ON a.route_id = r.id
    LEFT JOIN (
      SELECT
        route_id,
        COUNT(*) AS total_trips,
        COUNT(*) FILTER (WHERE sla_status = 'no_prazo') AS on_time
      FROM trips
      WHERE status = 'completed'
        AND window_end >= NOW() - (${days}::int * INTERVAL '1 day')
        AND route_id IS NOT NULL
      GROUP BY route_id
    ) t ON t.route_id = r.id
    WHERE COALESCE(a.alert_count, 0) > 0
    ORDER BY a.alert_count DESC NULLS LAST
    LIMIT 20
  `) as unknown as Array<{
    route_id:    string
    code:        string
    name:        string
    alert_count: number | string
    avg_delay:   number | string
    total_trips: number | string
    on_time:     number | string
  }>

  const result: ProblematicRouteRow[] = rows.map(r => {
    const totalTrips = Number(r.total_trips)
    const onTime     = Number(r.on_time)
    const avgDelay   = Number(r.avg_delay) || 0
    return {
      routeId:    r.route_id,
      code:       r.code,
      name:       r.name,
      alerts:     Number(r.alert_count),
      avgDelay:   Math.round(avgDelay * 10) / 10,
      slaPercent: totalTrips > 0 ? onTime / totalTrips : 0,
    }
  })

  await redis.set(key, JSON.stringify(result), 'EX', CACHE_TTL)
  return result
}

export type AlertsDistributionRow = {
  type:  string
  count: number
}

export async function getAlertsDistribution(range: Range = '30d'): Promise<AlertsDistributionRow[]> {
  const key = cacheKey('alerts-distribution', range)
  const cached = await redis.get(key)
  if (cached) {
    try { return JSON.parse(cached) as AlertsDistributionRow[] } catch { /* fall through */ }
  }

  const days = rangeDays(range)

  const rows = await db.execute(sql`
    SELECT
      type,
      COUNT(*) AS count
    FROM alerts
    WHERE occurred_at >= NOW() - (${days}::int * INTERVAL '1 day')
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
