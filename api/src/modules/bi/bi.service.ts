import { sql, and, eq, gte, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import { trips } from '../../db/schema/trips'
import { alerts } from '../../db/schema/alerts'
import { clients } from '../../db/schema/clients'
import { drivers } from '../../db/schema/drivers'
import { routes } from '../../db/schema/routes'

export type BiPeriod    = 'today' | '7d' | '30d' | '90d'
export type BiDimension = 'client' | 'driver' | 'region' | 'route'
export type BiMetric    = 'deliveries' | 'sla_pct' | 'alerts' | 'delay_avg'

function periodCutoff(p: BiPeriod): Date {
  const d = new Date()
  if (p === 'today') d.setHours(0, 0, 0, 0)
  else if (p === '7d')  d.setDate(d.getDate() - 7)
  else if (p === '30d') d.setDate(d.getDate() - 30)
  else                  d.setDate(d.getDate() - 90)
  return d
}

export interface BiKpis {
  period: BiPeriod
  deliveries: { total: number; completed: number; onTimePct: number }
  sla:        { pct: number; onTime: number; closed: number }
  alerts:     { open: number; critical: number; createdInWindow: number }
  delayAvg:   { minutes: number }
  risk:       { critico: number; alto: number; medio: number; baixo: number }
}

export async function getExecutiveKpis(period: BiPeriod, clientId?: string): Promise<BiKpis> {
  const cutoff = periodCutoff(period)

  const tripConditions = [gte(trips.windowStart, cutoff)]
  if (clientId) tripConditions.push(eq(trips.clientId, clientId))
  const tripsRows = await db.select().from(trips).where(and(...tripConditions))

  const deliveriesTotal = tripsRows.length
  const completed = tripsRows.filter((t) => t.status === 'completed')
  const onTime    = completed.filter((t) => t.arrivedAt && t.arrivedAt <= t.windowEnd)
  const onTimePct = completed.length > 0 ? Math.round((onTime.length / completed.length) * 100) : 100

  // Risk distribution (active trips with snapshot)
  const risk = { critico: 0, alto: 0, medio: 0, baixo: 0 }
  for (const t of tripsRows) {
    if (t.riskLevel && t.riskLevel in risk) (risk as any)[t.riskLevel]++
  }

  const alertConditions = [gte(alerts.occurredAt, cutoff)]
  if (clientId) {
    const tripIds = tripsRows.map((t) => t.id)
    if (tripIds.length > 0) alertConditions.push(inArray(alerts.tripId, tripIds))
    else alertConditions.push(sql`false`)
  }
  const alertRows = await db.select().from(alerts).where(and(...alertConditions))
  const openAlerts = alertRows.filter((a) => !['resolvido', 'encerrado'].includes(a.status))
  const criticalAlerts = openAlerts.filter((a) => a.severity === 'critico')

  // Delay average — only completed trips with arrival data
  const delays = completed
    .filter((t) => t.arrivedAt && t.windowEnd)
    .map((t) => (t.arrivedAt!.getTime() - t.windowEnd.getTime()) / 60_000)
  const delayAvgMin = delays.length > 0
    ? Math.round(delays.reduce((s, x) => s + Math.max(0, x), 0) / delays.length)
    : 0

  return {
    period,
    deliveries: { total: deliveriesTotal, completed: completed.length, onTimePct },
    sla:        { pct: onTimePct, onTime: onTime.length, closed: completed.length },
    alerts:     { open: openAlerts.length, critical: criticalAlerts.length, createdInWindow: alertRows.length },
    delayAvg:   { minutes: delayAvgMin },
    risk,
  }
}

export interface BiBreakdownRow {
  key:          string
  label:        string
  deliveries:   number
  completed:    number
  onTime:       number
  slaPct:       number
  alertsCount:  number
  delayAvgMin:  number
}

export async function getBreakdown(dimension: BiDimension, period: BiPeriod, clientId?: string): Promise<BiBreakdownRow[]> {
  const cutoff = periodCutoff(period)
  const conditions = [gte(trips.windowStart, cutoff)]
  if (clientId) conditions.push(eq(trips.clientId, clientId))

  // Pre-fetch entity names for the active dimension
  const [clientList, driverList, routeList] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients),
    db.select({ id: drivers.id, name: drivers.name, base: drivers.base }).from(drivers),
    db.select({ id: routes.id, code: routes.code, name: routes.name }).from(routes),
  ])
  const clientNameById = new Map(clientList.map((c) => [c.id, c.name]))
  const driverInfoById = new Map(driverList.map((d) => [d.id, d]))
  const routeInfoById  = new Map(routeList.map((r) => [r.id, r]))

  const tripsRows = await db.select().from(trips).where(and(...conditions))
  const alertRows = tripsRows.length > 0
    ? await db.select().from(alerts).where(inArray(alerts.tripId, tripsRows.map((t) => t.id)))
    : []
  const alertCountByTrip = new Map<string, number>()
  for (const a of alertRows) {
    if (!a.tripId) continue
    alertCountByTrip.set(a.tripId, (alertCountByTrip.get(a.tripId) ?? 0) + 1)
  }

  const groups = new Map<string, { label: string; trips: typeof tripsRows }>()
  for (const t of tripsRows) {
    let key: string | null = null
    let label = '—'
    if (dimension === 'client') {
      if (!t.clientId) continue
      key = t.clientId
      label = clientNameById.get(t.clientId) ?? '—'
    } else if (dimension === 'driver') {
      if (!t.driverId) continue
      key = t.driverId
      label = driverInfoById.get(t.driverId)?.name ?? '—'
    } else if (dimension === 'route') {
      if (!t.routeId) continue
      key = t.routeId
      const r = routeInfoById.get(t.routeId)
      label = r ? `${r.code} · ${r.name ?? ''}`.trim() : '—'
    } else if (dimension === 'region') {
      // Region inferred from driver.base (CD ...) as a stable proxy
      if (!t.driverId) continue
      const d = driverInfoById.get(t.driverId)
      if (!d?.base) continue
      key = d.base
      label = d.base
    }
    if (!key) continue
    const cur = groups.get(key)
    if (cur) cur.trips.push(t)
    else groups.set(key, { label, trips: [t] })
  }

  const rows: BiBreakdownRow[] = []
  for (const [key, g] of groups) {
    const completed   = g.trips.filter((t) => t.status === 'completed')
    const onTime      = completed.filter((t) => t.arrivedAt && t.arrivedAt <= t.windowEnd)
    const slaPct      = completed.length > 0 ? Math.round((onTime.length / completed.length) * 100) : 100
    const alertsCount = g.trips.reduce((acc, t) => acc + (alertCountByTrip.get(t.id) ?? 0), 0)
    const delays      = completed
      .filter((t) => t.arrivedAt && t.windowEnd)
      .map((t) => Math.max(0, (t.arrivedAt!.getTime() - t.windowEnd.getTime()) / 60_000))
    const delayAvgMin = delays.length > 0 ? Math.round(delays.reduce((s, x) => s + x, 0) / delays.length) : 0
    rows.push({
      key,
      label:       g.label,
      deliveries:  g.trips.length,
      completed:   completed.length,
      onTime:      onTime.length,
      slaPct,
      alertsCount,
      delayAvgMin,
    })
  }
  return rows.sort((a, b) => b.deliveries - a.deliveries)
}

export interface BiTrendPoint { date: string; value: number }

export async function getTrendSeries(metric: BiMetric, period: BiPeriod, clientId?: string): Promise<BiTrendPoint[]> {
  const cutoff = periodCutoff(period)

  if (metric === 'alerts') {
    const cutoffIso = cutoff.toISOString()
    const rows = await db.execute<{ date: string; value: string }>(sql`
      SELECT TO_CHAR(DATE(occurred_at), 'YYYY-MM-DD') AS date,
             COUNT(*)::text AS value
      FROM alerts
      WHERE occurred_at >= ${cutoffIso}::timestamptz
      GROUP BY 1 ORDER BY 1 ASC
    `)
    return (rows as unknown as Array<{ date: string; value: string }>).map((r) => ({ date: String(r.date), value: Number(r.value) }))
  }

  // deliveries / sla_pct / delay_avg are derived from trips
  const conditions = [gte(trips.windowStart, cutoff)]
  if (clientId) conditions.push(eq(trips.clientId, clientId))
  const tripsRows = await db.select().from(trips).where(and(...conditions))

  // group by date(windowEnd)
  const buckets = new Map<string, { total: number; completed: number; onTime: number; delaySum: number; delayCount: number }>()
  for (const t of tripsRows) {
    const d = t.windowEnd.toISOString().substring(0, 10)
    const b = buckets.get(d) ?? { total: 0, completed: 0, onTime: 0, delaySum: 0, delayCount: 0 }
    b.total++
    if (t.status === 'completed') {
      b.completed++
      if (t.arrivedAt && t.arrivedAt <= t.windowEnd) b.onTime++
      if (t.arrivedAt) {
        b.delaySum += Math.max(0, (t.arrivedAt.getTime() - t.windowEnd.getTime()) / 60_000)
        b.delayCount++
      }
    }
    buckets.set(d, b)
  }
  const entries = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))
  return entries.map(([date, b]) => {
    let value = 0
    if (metric === 'deliveries')  value = b.total
    else if (metric === 'sla_pct') value = b.completed > 0 ? Math.round((b.onTime / b.completed) * 100) : 100
    else if (metric === 'delay_avg') value = b.delayCount > 0 ? Math.round(b.delaySum / b.delayCount) : 0
    return { date, value }
  })
}
