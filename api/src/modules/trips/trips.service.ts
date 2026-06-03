import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { trips } from '../../db/schema/trips'
import { drivers } from '../../db/schema/drivers'
import { clients } from '../../db/schema/clients'
import { routes } from '../../db/schema/routes'
import { tripEvents } from '../../db/schema/trip-events'

export type TripFilters = {
  status?:     'planned'|'in_progress'|'completed'|'delayed'|'cancelled'
  slaStatus?:  'no_prazo'|'em_risco'|'atrasado'|'sem_sinal'
  clientName?: string
  driverName?: string
  priority?:   'alta'|'media'|'baixa'
  routeCode?:  string
  search?:     string
}

export async function listTrips(filters: TripFilters, page = 0, limit = 100) {
  const conditions = []
  if (filters.status)    conditions.push(eq(trips.status, filters.status))
  if (filters.slaStatus) conditions.push(eq(trips.slaStatus, filters.slaStatus))
  if (filters.priority)  conditions.push(eq(trips.priority, filters.priority))

  if (filters.clientName) {
    const [c] = await db.select({ id: clients.id }).from(clients).where(eq(clients.name, filters.clientName)).limit(1)
    conditions.push(c ? eq(trips.clientId, c.id) : sql`false`)
  }
  if (filters.routeCode) {
    const [r] = await db.select({ id: routes.id }).from(routes).where(eq(routes.code, filters.routeCode)).limit(1)
    conditions.push(r ? eq(trips.routeId, r.id) : sql`false`)
  }
  if (filters.driverName) {
    const matchingDrivers = await db.select({ id: drivers.id }).from(drivers).where(ilike(drivers.name, `%${filters.driverName}%`))
    if (matchingDrivers.length === 0) {
      conditions.push(sql`false`)
    } else {
      conditions.push(sql`${trips.driverId} IN (${sql.join(matchingDrivers.map(d => sql`${d.id}`), sql`, `)})`)
    }
  }
  if (filters.search) {
    conditions.push(or(
      ilike(trips.code, `%${filters.search}%`),
      ilike(trips.origin, `%${filters.search}%`),
      ilike(trips.destination, `%${filters.search}%`),
    )!)
  }

  const where = conditions.length ? and(...conditions) : undefined

  const rows = await db.query.trips.findMany({
    where,
    with: {
      driver:  { columns: { id: true, name: true, photoUrl: true, code: true } },
      vehicle: { columns: { plate: true, type: true } },
      client:  { columns: { name: true } },
      route:   { columns: { code: true, name: true } },
    },
    orderBy: (t, { desc }) => [desc(t.windowStart)],
    limit,
    offset: page * limit,
  })

  return rows.map(toTripDto)
}

export async function getTripById(id: string) {
  const trip = await db.query.trips.findFirst({
    where: eq(trips.id, id),
    with: {
      driver:  { columns: { id: true, name: true, photoUrl: true, code: true } },
      vehicle: { columns: { plate: true, type: true } },
      client:  { columns: { name: true } },
      route:   { columns: { code: true, name: true } },
    },
  })
  return trip ? toTripDto(trip) : null
}

export async function getTripStats() {
  const allActive = await db.select().from(trips).where(or(
    eq(trips.status, 'in_progress'),
    eq(trips.status, 'planned'),
    eq(trips.status, 'delayed'),
  )!)
  const total    = allActive.length
  const noPrazo  = allActive.filter(t => t.slaStatus === 'no_prazo').length
  const emRisco  = allActive.filter(t => t.slaStatus === 'em_risco').length
  const atrasadas = allActive.filter(t => t.slaStatus === 'atrasado' || t.status === 'delayed').length
  const avgProgress = total > 0 ? Math.round(allActive.reduce((s, t) => s + (t.progressPct ?? 0), 0) / total) : 0

  return {
    total:          { count: total },
    noPrazo:        { count: noPrazo,   pct: total ? Math.round((noPrazo   / total) * 100) : 0 },
    emRisco:        { count: emRisco,   pct: total ? Math.round((emRisco   / total) * 100) : 0 },
    atrasadas:      { count: atrasadas, pct: total ? Math.round((atrasadas / total) * 100) : 0 },
    progressoMedio: { pct: avgProgress },
  }
}

function toTripDto(row: any) {
  return {
    id:            row.id,
    code:          row.code,
    driverId:      row.driverId,
    vehicleId:     row.vehicleId,
    driverName:    row.driver?.name ?? '',
    driverPhoto:   row.driver?.photoUrl ?? null,
    plate:         row.vehicle?.plate ?? '',
    clientName:    row.client?.name ?? '',
    operationName: row.route?.name ?? '',
    routeCode:     row.route?.code ?? '',
    priority:      row.priority,
    origin:        row.origin,
    destination:   row.destination,
    originLat:     row.originLat ? Number(row.originLat) : 0,
    originLng:     row.originLng ? Number(row.originLng) : 0,
    destLat:       row.destLat ? Number(row.destLat) : 0,
    destLng:       row.destLng ? Number(row.destLng) : 0,
    windowStart:   row.windowStart,
    windowEnd:     row.windowEnd,
    eta:           row.eta,
    departedAt:    row.departedAt,
    arrivedAt:     row.arrivedAt,
    status:        row.status,
    slaStatus:     row.slaStatus,
    progressPct:   row.progressPct,
    distanceTotal: row.distanceTotal ? Number(row.distanceTotal) : 0,
    distanceDone:  row.distanceDone  ? Number(row.distanceDone)  : 0,
    // Sprint 3 — risk snapshot (nullable until first recalc)
    riskScore:     row.riskScore ?? null,
    riskLevel:     row.riskLevel ?? null,
    riskFactors:   row.riskFactors ?? null,
  }
}

/**
 * Registra uma nota / intervenção do operador como trip_event (Phase 12, D-12-29).
 * kind: manual_note | reagendamento | autorizacao_atraso. Torre é read-only sobre
 * a fonte Lamonica — a intervenção fica como evento local na timeline.
 */
export async function addTripNote(input: {
  tripId: string
  userId: string
  text: string
  kind?: 'manual_note' | 'reagendamento' | 'autorizacao_atraso'
}) {
  const [exists] = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, input.tripId)).limit(1)
  if (!exists) return null
  const [row] = await db.insert(tripEvents).values({
    tripId:    input.tripId,
    eventType: input.kind ?? 'manual_note',
    notes:     input.text,
    createdBy: input.userId,
    occurredAt: new Date(),
    metadata:  { source: 'operator' },
  }).returning()
  return row
}
