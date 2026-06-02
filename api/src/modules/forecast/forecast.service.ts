import { and, gte, inArray, isNotNull } from 'drizzle-orm'
import { db } from '../../db/client'
import { trips } from '../../db/schema/trips'
import { drivers } from '../../db/schema/drivers'
import { clients } from '../../db/schema/clients'
import { projectSeries, type SeriesPoint, type ForecastPoint } from './forecast.engine'

export interface DemandForecast {
  history:    SeriesPoint[]
  forecast:   ForecastPoint[]
  total7d:    number      // sum of next-7-days projected demand
  trend:      'up' | 'down' | 'flat'
  breakdown?: Array<{ key: string; label: string; total7d: number; share: number }>
}

export interface RegionRisk {
  key:          string   // driver.base
  label:        string
  trips7d:      number   // projected
  riskScore:    number   // 0-100 derived
  currentRiskShare: number // pct of current trips that are alto/critico in this base
}

export interface DelayRiskForecast {
  next24h: {
    expectedTrips:    number
    expectedBreaches: number
    breachPct:        number
  }
  historical: {
    breachPctLastWeek: number
  }
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().substring(0, 10)
}

function toDay(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().substring(0, 10)
}

/**
 * Fill missing days in a date-bucketed series with zeros so the engine sees
 * a contiguous time series (otherwise the linear trend is fit on irregularly
 * spaced points and the seasonal index is meaningless).
 */
function densifyDaily(start: string, end: string, byDay: Map<string, number>): SeriesPoint[] {
  const out: SeriesPoint[] = []
  let cur = start
  while (cur <= end) {
    out.push({ date: cur, value: byDay.get(cur) ?? 0 })
    cur = addDaysIso(cur, 1)
  }
  return out
}

export type Dimension = 'total' | 'client' | 'region'

export async function forecastDemand(opts: {
  lookbackDays?: number
  horizonDays?:  number
  dimension?:    Dimension
}): Promise<DemandForecast> {
  const lookback = opts.lookbackDays ?? 30
  const horizon  = opts.horizonDays  ?? 7

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - lookback)
  cutoff.setHours(0, 0, 0, 0)
  const cutoffIso = toDay(cutoff)
  const todayIso  = toDay(new Date())

  // Use departedAt when available (real demand); fall back to windowStart for plan-only trips.
  const rows = await db.select({
    id:           trips.id,
    windowStart:  trips.windowStart,
    departedAt:   trips.departedAt,
    clientId:     trips.clientId,
    driverId:     trips.driverId,
  }).from(trips).where(gte(trips.windowStart, cutoff))

  // Helper to get the day key for a row
  const dayOf = (r: typeof rows[number]): string => toDay(r.departedAt ?? r.windowStart)

  // Bucket by day for total series
  const byDayTotal = new Map<string, number>()
  for (const r of rows) {
    const day = dayOf(r)
    byDayTotal.set(day, (byDayTotal.get(day) ?? 0) + 1)
  }
  const history = densifyDaily(cutoffIso, todayIso, byDayTotal)
  const forecast = projectSeries(history, horizon)
  const total7d = forecast.reduce((s, p) => s + p.value, 0)

  // Trend label from the engine slope
  const last7   = history.slice(-7).reduce((s, p) => s + p.value, 0)
  const next7   = total7d
  const trend: DemandForecast['trend'] = next7 > last7 * 1.05 ? 'up' : next7 < last7 * 0.95 ? 'down' : 'flat'

  // Optional breakdown
  let breakdown: DemandForecast['breakdown'] | undefined
  if (opts.dimension === 'client' || opts.dimension === 'region') {
    const groupKeyOf = async (): Promise<Map<string, { label: string; rows: typeof rows }>> => {
      const groups = new Map<string, { label: string; rows: typeof rows }>()
      if (opts.dimension === 'client') {
        const clientList = await db.select({ id: clients.id, name: clients.name }).from(clients)
        const nameById = new Map(clientList.map((c) => [c.id, c.name]))
        for (const r of rows) {
          if (!r.clientId) continue
          const cur = groups.get(r.clientId) ?? { label: nameById.get(r.clientId) ?? '—', rows: [] }
          cur.rows.push(r); groups.set(r.clientId, cur)
        }
      } else {
        const driverList = await db.select({ id: drivers.id, base: drivers.base }).from(drivers)
        const baseById = new Map(driverList.map((d) => [d.id, d.base]))
        for (const r of rows) {
          if (!r.driverId) continue
          const base = baseById.get(r.driverId)
          if (!base) continue
          const cur = groups.get(base) ?? { label: base, rows: [] }
          cur.rows.push(r); groups.set(base, cur)
        }
      }
      return groups
    }
    const groups = await groupKeyOf()
    breakdown = []
    for (const [key, g] of groups) {
      const byDay = new Map<string, number>()
      for (const r of g.rows) {
        const day = dayOf(r)
        byDay.set(day, (byDay.get(day) ?? 0) + 1)
      }
      const h = densifyDaily(cutoffIso, todayIso, byDay)
      const f = projectSeries(h, horizon)
      breakdown.push({ key, label: g.label, total7d: f.reduce((s, p) => s + p.value, 0), share: 0 })
    }
    const sumGroups = breakdown.reduce((s, b) => s + b.total7d, 0) || 1
    for (const b of breakdown) b.share = Math.round((b.total7d / sumGroups) * 100)
    breakdown.sort((a, b) => b.total7d - a.total7d)
  }

  return { history, forecast, total7d, trend, breakdown }
}

/**
 * Project regions most at risk in the next 7 days. Combines projected
 * demand with current at-risk share, so a busy base that's already running
 * hot ranks higher than a quiet base.
 */
export async function forecastRegions(): Promise<RegionRisk[]> {
  const lookback = 30
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - lookback)
  cutoff.setHours(0, 0, 0, 0)

  const tripRows = await db.select().from(trips).where(gte(trips.windowStart, cutoff))
  const driverList = await db.select({ id: drivers.id, base: drivers.base }).from(drivers)
  const baseById = new Map(driverList.map((d) => [d.id, d.base]))

  const byBase = new Map<string, { rows: typeof tripRows; atRiskNow: number; total: number }>()
  for (const t of tripRows) {
    if (!t.driverId) continue
    const base = baseById.get(t.driverId)
    if (!base) continue
    const cur = byBase.get(base) ?? { rows: [], atRiskNow: 0, total: 0 }
    cur.rows.push(t)
    if (t.status === 'in_progress' || t.status === 'planned' || t.status === 'delayed') {
      cur.total++
      if (t.riskLevel === 'alto' || t.riskLevel === 'critico') cur.atRiskNow++
    }
    byBase.set(base, cur)
  }

  const todayIso  = toDay(new Date())
  const cutoffIso = toDay(cutoff)

  const out: RegionRisk[] = []
  for (const [base, g] of byBase) {
    const byDay = new Map<string, number>()
    for (const r of g.rows) {
      const day = toDay(r.departedAt ?? r.windowStart)
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }
    const h = densifyDaily(cutoffIso, todayIso, byDay)
    const f = projectSeries(h, 7)
    const projected = f.reduce((s, p) => s + p.value, 0)
    const currentRiskShare = g.total > 0 ? Math.round((g.atRiskNow / g.total) * 100) : 0
    // Composite score: 60% demand intensity (normalized to max-100), 40% current risk pct
    const score = Math.min(100, Math.round(0.6 * Math.min(100, projected * 10) + 0.4 * currentRiskShare))
    out.push({
      key:               base,
      label:             base,
      trips7d:           projected,
      riskScore:         score,
      currentRiskShare,
    })
  }
  return out.sort((a, b) => b.riskScore - a.riskScore)
}

/**
 * Crude near-term breach risk: average breach rate last 7 days × expected
 * trips next 24h. Provides a single percentage instead of asking the operator
 * to interpret raw counts.
 */
export async function forecastDelayRisk(): Promise<DelayRiskForecast> {
  const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7); sevenAgo.setHours(0,0,0,0)
  const completed = await db.query.trips.findMany({
    where: and(gte(trips.windowEnd, sevenAgo), isNotNull(trips.arrivedAt)),
  })
  const total      = completed.length
  const breaches   = completed.filter((t) => t.arrivedAt && t.windowEnd && t.arrivedAt > t.windowEnd).length
  const breachPct  = total > 0 ? Math.round((breaches / total) * 100) : 0

  // Forecast next-24h demand using demand engine
  const dem = await forecastDemand({ lookbackDays: 30, horizonDays: 1, dimension: 'total' })
  const expectedTrips = dem.forecast[0]?.value ?? 0
  const expectedBreaches = Math.round(expectedTrips * (breachPct / 100))

  return {
    next24h: {
      expectedTrips,
      expectedBreaches,
      breachPct: expectedTrips > 0 ? Math.round((expectedBreaches / expectedTrips) * 100) : 0,
    },
    historical: { breachPctLastWeek: breachPct },
  }
}
