import { sql, and, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import { trips } from '../../db/schema/trips'
import { alerts } from '../../db/schema/alerts'
import { clients } from '../../db/schema/clients'
import { drivers } from '../../db/schema/drivers'
import { routes } from '../../db/schema/routes'
import { prazoRangeSql } from '../../lib/prazoRange'

export type BiDimension = 'client' | 'driver' | 'region' | 'route'
export type BiMetric    = 'deliveries' | 'sla_pct' | 'alerts' | 'delay_avg'

// Filtro de Prazo Final por intervalo de datas (window_end). Ambos opcionais; nenhum => sem corte.
export interface BiDateRange {
  inicio?: string | null
  fim?:    string | null
  clientId?: string
}

// Atraso em minutos — adiantamento_horas: + = ATRASADO (adapter grava -calcularAdiantamentoHoras,
// ver painel-sync.ts:131). Fallback p/ arrivedAt - windowEnd quando NULL (histórico importado).
function delayMinutes(t: { adiantamentoHoras: string | null; arrivedAt: Date | null; windowEnd: Date }): number | null {
  if (t.adiantamentoHoras != null) return Math.max(0, Number(t.adiantamentoHoras) * 60)
  if (t.arrivedAt) return Math.max(0, (t.arrivedAt.getTime() - t.windowEnd.getTime()) / 60_000)
  return null
}

// Normaliza nome (acentos/caixa) — espelho JS do upper(translate(...)) de getDriverDossieByName.
const normName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase()

export interface BiKpis {
  period: string
  deliveries: { total: number; completed: number; onTimePct: number }
  sla:        { pct: number; onTime: number; closed: number }
  alerts:     { open: number; critical: number; createdInWindow: number }
  delayAvg:   { minutes: number }
  risk:       { critico: number; alto: number; medio: number; baixo: number }
}

export async function getExecutiveKpis({ inicio, fim, clientId }: BiDateRange): Promise<BiKpis> {
  // Universo canônico = painel + cargas (igual Viagens, trips.service.ts) — exclui seed/histórico (source nulo).
  const tripConditions = [sql`(${prazoRangeSql(sql`window_end`, inicio, fim)})`, sql`${trips.source} IN ('painel', 'cargas')`]
  if (clientId) tripConditions.push(eq(trips.clientId, clientId))
  const tripsRows = await db.select().from(trips).where(and(...tripConditions))

  const deliveriesTotal = tripsRows.length
  const completed = tripsRows.filter((t) => t.status === 'completed')
  // SLA de ENTREGA canônico (sla_status, igual Dashboard/Insights) — Onda E / D-14.
  // Antes usava arrivedAt<=windowEnd (divergia: 9% vs 68%). Agora no_prazo/(no_prazo+atrasadas).
  const noPrazoCount   = tripsRows.filter((t) => t.slaStatus === 'no_prazo').length
  const atrasadasCount = tripsRows.filter((t) => t.slaStatus === 'atrasado').length
  const aferidas       = noPrazoCount + atrasadasCount
  const onTimePct      = aferidas > 0 ? Math.round((noPrazoCount / aferidas) * 100) : 100

  // Risk distribution (active trips with snapshot)
  const risk = { critico: 0, alto: 0, medio: 0, baixo: 0 }
  for (const t of tripsRows) {
    if (t.riskLevel && t.riskLevel in risk) (risk as any)[t.riskLevel]++
  }

  const tripIds = tripsRows.map((t) => t.id)
  const alertConditions = [sql`(${prazoRangeSql(sql`occurred_at`, inicio, fim)})`]
  if (clientId) {
    if (tripIds.length > 0) alertConditions.push(inArray(alerts.tripId, tripIds))
    else alertConditions.push(sql`false`)
  }
  const alertRows = await db.select().from(alerts).where(and(...alertConditions)) // createdInWindow (período)

  // Ocorrências ABERTAS = não-terminais, escopadas pela DATA DE ABERTURA (occurred_at) no intervalo
  // (igual Torre/Ocorrências) p/ a tela honrar o filtro e não derrubar tickets sem viagem.
  const openConds = [sql`${alerts.status} NOT IN ('resolvido','encerrado')`]
  if (inicio || fim) openConds.push(prazoRangeSql(sql`${alerts.occurredAt}`, inicio, fim))
  if (clientId) {
    if (tripIds.length > 0) openConds.push(inArray(alerts.tripId, tripIds))
    else openConds.push(sql`false`)
  }
  const openAlerts = await db.select().from(alerts).where(and(...openConds))
  const criticalAlerts = openAlerts.filter((a) => a.severity === 'critico')

  // Atraso médio — adiantamento_horas (+ = atrasado, convenção do painel); fallback arrivedAt p/ histórico.
  const delays = tripsRows.map(delayMinutes).filter((m): m is number => m != null)
  const delayAvgMin = delays.length > 0
    ? Math.round(delays.reduce((s, x) => s + x, 0) / delays.length)
    : 0

  return {
    period: `${inicio ?? ''}..${fim ?? ''}`,
    deliveries: { total: deliveriesTotal, completed: completed.length, onTimePct },
    sla:        { pct: onTimePct, onTime: noPrazoCount, closed: aferidas },
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

export async function getBreakdown(dimension: BiDimension, { inicio, fim, clientId }: BiDateRange): Promise<BiBreakdownRow[]> {
  // Universo canônico = painel + cargas (igual Viagens, trips.service.ts) — exclui seed/histórico (source nulo).
  const conditions = [sql`(${prazoRangeSql(sql`window_end`, inicio, fim)})`, sql`${trips.source} IN ('painel', 'cargas')`]
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

  // Trips do painel/cargas não têm clientId/driverId/routeId — fallback p/ colunas sheet_*/origin/destination
  // e bucket '(sem vínculo)' onde não há chave, p/ a soma FECHAR com os KPIs da mesma tela.
  const groups = new Map<string, { label: string; trips: typeof tripsRows }>()
  for (const t of tripsRows) {
    let key: string | null = null
    let label = '—'
    if (dimension === 'client') {
      key = t.clientId ?? '(sem cliente)'
      label = t.clientId ? (clientNameById.get(t.clientId) ?? '—') : '(sem cliente)'
    } else if (dimension === 'driver') {
      if (t.driverId) {
        key = t.driverId
        label = driverInfoById.get(t.driverId)?.name ?? '—'
      } else if (t.sheetMotorista) {
        key = 'sheet:' + normName(t.sheetMotorista)
        label = t.sheetMotorista.trim()
      } else {
        key = '(sem vínculo)'
        label = '(sem vínculo)'
      }
    } else if (dimension === 'route') {
      if (t.routeId) {
        key = t.routeId
        const r = routeInfoById.get(t.routeId)
        label = r ? `${r.code} · ${r.name ?? ''}`.trim() : '—'
      } else if (t.origin || t.destination) {
        key = `${t.origin ?? '—'} → ${t.destination ?? '—'}`
        label = key
      } else {
        key = '(sem vínculo)'
        label = '(sem vínculo)'
      }
    } else if (dimension === 'region') {
      // Region inferred from driver.base (CD ...) as a stable proxy
      const base = t.driverId ? driverInfoById.get(t.driverId)?.base : null
      key = base ?? '(sem vínculo)'
      label = key
    }
    if (!key) continue
    const cur = groups.get(key)
    if (cur) cur.trips.push(t)
    else groups.set(key, { label, trips: [t] })
  }

  const rows: BiBreakdownRow[] = []
  for (const [key, g] of groups) {
    const completed   = g.trips.filter((t) => t.status === 'completed')
    // SLA de entrega canônico (sla_status) — Onda E / D-14
    const noPrazo     = g.trips.filter((t) => t.slaStatus === 'no_prazo').length
    const atrasadas   = g.trips.filter((t) => t.slaStatus === 'atrasado').length
    const aferidas    = noPrazo + atrasadas
    const slaPct      = aferidas > 0 ? Math.round((noPrazo / aferidas) * 100) : 100
    const alertsCount = g.trips.reduce((acc, t) => acc + (alertCountByTrip.get(t.id) ?? 0), 0)
    // Atraso médio — adiantamento_horas (+ = atrasado); fallback arrivedAt p/ histórico.
    const delays      = g.trips.map(delayMinutes).filter((m): m is number => m != null)
    const delayAvgMin = delays.length > 0 ? Math.round(delays.reduce((s, x) => s + x, 0) / delays.length) : 0
    rows.push({
      key,
      label:       g.label,
      deliveries:  g.trips.length,
      completed:   completed.length,
      onTime:      noPrazo,
      slaPct,
      alertsCount,
      delayAvgMin,
    })
  }
  return rows.sort((a, b) => b.deliveries - a.deliveries)
}

export interface BiTrendPoint { date: string; value: number }

export async function getTrendSeries(metric: BiMetric, { inicio, fim, clientId }: BiDateRange): Promise<BiTrendPoint[]> {
  if (metric === 'alerts') {
    const rows = await db.execute<{ date: string; value: string }>(sql`
      SELECT TO_CHAR(DATE(occurred_at), 'YYYY-MM-DD') AS date,
             COUNT(*)::text AS value
      FROM alerts
      WHERE (${prazoRangeSql(sql`occurred_at`, inicio, fim)})
      GROUP BY 1 ORDER BY 1 ASC
    `)
    return (rows as unknown as Array<{ date: string; value: string }>).map((r) => ({ date: String(r.date), value: Number(r.value) }))
  }

  // deliveries / sla_pct / delay_avg are derived from trips
  // Universo canônico = painel + cargas (igual Viagens, trips.service.ts) — exclui seed/histórico (source nulo).
  const conditions = [sql`(${prazoRangeSql(sql`window_end`, inicio, fim)})`, sql`${trips.source} IN ('painel', 'cargas')`]
  if (clientId) conditions.push(eq(trips.clientId, clientId))
  const tripsRows = await db.select().from(trips).where(and(...conditions))

  // group by date(windowEnd)
  const buckets = new Map<string, { total: number; completed: number; onTime: number; noPrazo: number; atrasadas: number; delaySum: number; delayCount: number }>()
  for (const t of tripsRows) {
    const d = t.windowEnd.toISOString().substring(0, 10)
    const b = buckets.get(d) ?? { total: 0, completed: 0, onTime: 0, noPrazo: 0, atrasadas: 0, delaySum: 0, delayCount: 0 }
    b.total++
    // SLA de entrega canônico por bucket (sla_status) — Onda E / D-14
    if (t.slaStatus === 'no_prazo') b.noPrazo++
    else if (t.slaStatus === 'atrasado') b.atrasadas++
    if (t.status === 'completed') {
      b.completed++
      if (t.arrivedAt && t.arrivedAt <= t.windowEnd) b.onTime++
    }
    // Atraso — adiantamento_horas (+ = atrasado); fallback arrivedAt p/ histórico.
    const dm = delayMinutes(t)
    if (dm != null) { b.delaySum += dm; b.delayCount++ }
    buckets.set(d, b)
  }
  const entries = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))
  return entries.map(([date, b]) => {
    let value = 0
    if (metric === 'deliveries')  value = b.total
    else if (metric === 'sla_pct') value = (b.noPrazo + b.atrasadas) > 0 ? Math.round((b.noPrazo / (b.noPrazo + b.atrasadas)) * 100) : 100
    else if (metric === 'delay_avg') value = b.delayCount > 0 ? Math.round(b.delaySum / b.delayCount) : 0
    return { date, value }
  })
}
