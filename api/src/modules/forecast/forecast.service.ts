import { sql, and, gte, lte, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import { trips } from '../../db/schema/trips'
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
  key:          string   // trips.origin (região)
  label:        string
  trips7d:      number   // projected
  riskScore:    number   // 0-100 derived
  currentRiskShare: number // pct of current trips at risk (riskLevel alto/critico ou slaStatus em_risco/atrasado) nesta região
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

// Chave de região normalizada (origin é texto livre: acento/caixa/espaços variam entre fontes).
const normRegion = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()

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
  inicio?:      string | null
  fim?:         string | null
  horizonDays?: number
  dimension?:   Dimension
}): Promise<DemandForecast> {
  const horizon = opts.horizonDays ?? 7

  // Início do histórico = `inicio` (Prazo Final); sem ele, mantém o default de 30 dias atrás.
  let cutoff: Date
  if (opts.inicio) {
    cutoff = new Date(opts.inicio + 'T00:00:00')
  } else {
    cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    cutoff.setHours(0, 0, 0, 0)
  }
  // Projeção sempre pra frente a partir de hoje; `fim` (se informado) só limita o histórico.
  const histEnd   = opts.fim ? new Date(opts.fim + 'T23:59:59') : new Date()
  const cutoffIso = toDay(cutoff)
  const todayIso  = toDay(histEnd)

  // Use departedAt when available (real demand); fall back to windowStart for plan-only trips.
  // Universo operacional = painel + cargas (igual Viagens/Dashboard) — exclui seed/histórico (source nulo).
  const rows = await db.select({
    id:           trips.id,
    windowStart:  trips.windowStart,
    departedAt:   trips.departedAt,
    clientId:     trips.clientId,
    origin:       trips.origin,
  }).from(trips).where(and(
    gte(trips.windowStart, cutoff),
    opts.fim ? lte(trips.windowStart, histEnd) : undefined,
    sql`${trips.source} IN ('painel', 'cargas')`,
  ))

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
        // Região = origin da trip — driver.base via driverId é NULL nas fontes vivas.
        for (const r of rows) {
          const key = normRegion(r.origin ?? '')
          if (!key) continue
          const cur = groups.get(key) ?? { label: r.origin!.trim(), rows: [] }
          cur.rows.push(r); groups.set(key, cur)
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
 * demand with current at-risk share, so a busy region that's already running
 * hot ranks higher than a quiet one. Região = trips.origin (chave presente nas
 * fontes vivas — driver.base via driverId é NULL nas trips painel/cargas).
 */
export async function forecastRegions(): Promise<RegionRisk[]> {
  const lookback = 30
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - lookback)
  cutoff.setHours(0, 0, 0, 0)

  const tripRows = await db.select().from(trips).where(and(
    gte(trips.windowStart, cutoff),
    sql`${trips.source} IN ('painel', 'cargas')`,
  ))

  const byRegion = new Map<string, { label: string; rows: typeof tripRows; atRiskNow: number; total: number }>()
  for (const t of tripRows) {
    const key = normRegion(t.origin ?? '')
    if (!key) continue
    const cur = byRegion.get(key) ?? { label: t.origin!.trim(), rows: [], atRiskNow: 0, total: 0 }
    cur.rows.push(t)
    if (t.status === 'in_progress' || t.status === 'planned' || t.status === 'delayed') {
      cur.total++
      // riskLevel só existe onde o risk engine roda; nas fontes vivas o sinal é o slaStatus.
      if (t.riskLevel === 'alto' || t.riskLevel === 'critico' || t.slaStatus === 'em_risco' || t.slaStatus === 'atrasado') cur.atRiskNow++
    }
    byRegion.set(key, cur)
  }

  const todayIso  = toDay(new Date())
  const cutoffIso = toDay(cutoff)

  const out: RegionRisk[] = []
  for (const [key, g] of byRegion) {
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
      key,
      label:             g.label,
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
  // Quebra canônica (sla_status, igual Dashboard/BI — Onda E / D-14): atrasado/(no_prazo+atrasado)
  // sobre as fontes vivas. Antes usava arrivedAt>windowEnd — divergia (9% vs 68%) e arrivedAt é NULL nas trips reais.
  const aferidas = await db.select({ slaStatus: trips.slaStatus }).from(trips).where(and(
    gte(trips.windowEnd, sevenAgo),
    sql`${trips.source} IN ('painel', 'cargas')`,
    inArray(trips.slaStatus, ['no_prazo', 'atrasado']),
  ))
  const total      = aferidas.length
  const breaches   = aferidas.filter((t) => t.slaStatus === 'atrasado').length
  const breachPct  = total > 0 ? Math.round((breaches / total) * 100) : 0

  // Forecast next-24h demand using demand engine
  const dem = await forecastDemand({ inicio: null, horizonDays: 1, dimension: 'total' })
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
