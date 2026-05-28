import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { trips } from '../../db/schema/trips'
import { alerts } from '../../db/schema/alerts'
import { treatments } from '../../db/schema/treatments'
import { drivers } from '../../db/schema/drivers'
import { clients } from '../../db/schema/clients'
import { routes } from '../../db/schema/routes'
import { users } from '../../db/schema/users'
import { vehicles } from '../../db/schema/vehicles'
import { BOM, formatCsvRow } from './exports.csv'

/**
 * CSV streaming exports — 4 entities (viagens, alertas, tratativas, motoristas).
 *
 * Each function returns a `ReadableStream<Uint8Array>` that the Elysia plugin
 * MUST wrap in `new Response(stream, { headers })` — see Pitfall #4 / Elysia
 * issue #1741. Filters are applied at the SQL level so the exported file
 * matches what the operator sees on screen (CONTEXT D-07).
 *
 * Safety cap of 50 000 rows per export (CONTEXT D-09) — prevents DoS from
 * unbounded selects. The cap is enforced after WHERE clauses so the exported
 * subset reflects the requested filter window.
 *
 * @see CONTEXT D-06..D-10 (entities, filters, format, streaming, filename)
 * @see RESEARCH Pattern 2 lines 287-373
 */

const EXPORT_LIMIT = 50_000

// ---------------------------------------------------------------------------
// Viagens (trips)
// ---------------------------------------------------------------------------

export type TripsCsvFilters = {
  status?:     string
  slaStatus?:  string
  priority?:   string
  clientName?: string
  driverName?: string
  routeCode?:  string
  search?:     string
}

const TRIPS_HEADER = [
  'Código',
  'Motorista',
  'Veículo',
  'Cliente',
  'Rota',
  'Origem',
  'Destino',
  'Janela Início',
  'Janela Fim',
  'ETA',
  'Saída',
  'Chegada',
  'Status',
  'SLA',
  'Prioridade',
  'Progresso %',
  'Distância Total (km)',
  'Distância Percorrida (km)',
]

export function streamTripsCsv(filters: TripsCsvFilters): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(BOM + TRIPS_HEADER.join(';') + '\n'))

        const conditions: any[] = []
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
          conditions.push(
            or(
              ilike(trips.code, `%${filters.search}%`),
              ilike(trips.origin, `%${filters.search}%`),
              ilike(trips.destination, `%${filters.search}%`),
            )!,
          )
        }

        const where = conditions.length ? and(...conditions) : undefined

        const rows = await db.query.trips.findMany({
          where,
          with: {
            driver:  { columns: { name: true } },
            vehicle: { columns: { plate: true } },
            client:  { columns: { name: true } },
            route:   { columns: { code: true, name: true } },
          },
          orderBy: (t, { desc }) => [desc(t.windowStart)],
          limit: EXPORT_LIMIT,
        })

        for (const row of rows) {
          const line = formatCsvRow([
            row.code,
            row.driver?.name ?? '',
            row.vehicle?.plate ?? '',
            row.client?.name ?? '',
            row.route?.code ? `${row.route.code}${row.route.name ? ' — ' + row.route.name : ''}` : '',
            row.origin ?? '',
            row.destination ?? '',
            row.windowStart ? row.windowStart.toISOString() : '',
            row.windowEnd   ? row.windowEnd.toISOString()   : '',
            row.eta         ? row.eta.toISOString()         : '',
            row.departedAt  ? row.departedAt.toISOString()  : '',
            row.arrivedAt   ? row.arrivedAt.toISOString()   : '',
            row.status,
            row.slaStatus   ?? '',
            row.priority,
            row.progressPct,
            row.distanceTotal !== null && row.distanceTotal !== undefined ? Number(row.distanceTotal) : '',
            row.distanceDone  !== null && row.distanceDone  !== undefined ? Number(row.distanceDone)  : '',
          ])
          controller.enqueue(encoder.encode(line + '\n'))
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Alertas (alerts)
// ---------------------------------------------------------------------------

export type AlertsCsvFilters = {
  severity?: string
  status?:   string
  type?:     string
  search?:   string
}

const ALERTS_HEADER = [
  'ID Alerta',
  'Tipo',
  'Severidade',
  'Status',
  'Viagem',
  'Motorista',
  'Veículo',
  'Atribuído a',
  'Título',
  'Descrição',
  'Fonte',
  'Atraso (min)',
  'Desvio (km)',
  'Ocorrido em',
  'Resolvido em',
  'SLA Deadline',
]

export function streamAlertsCsv(filters: AlertsCsvFilters): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(BOM + ALERTS_HEADER.join(';') + '\n'))

        const conditions: any[] = []
        if (filters.severity) conditions.push(eq(alerts.severity, filters.severity))
        if (filters.status)   conditions.push(eq(alerts.status, filters.status))
        if (filters.type)     conditions.push(eq(alerts.type, filters.type))
        if (filters.search) {
          conditions.push(
            or(
              ilike(alerts.title, `%${filters.search}%`),
              ilike(alerts.description, `%${filters.search}%`),
            )!,
          )
        }

        const where = conditions.length ? and(...conditions) : undefined

        const rows = await db.query.alerts.findMany({
          where,
          with: {
            trip:    { columns: { code: true } },
            driver:  { columns: { name: true } },
            vehicle: { columns: { plate: true } },
            assignee: { columns: { name: true } },
          },
          orderBy: (a, { desc }) => [desc(a.occurredAt)],
          limit: EXPORT_LIMIT,
        }) as any[]

        for (const row of rows) {
          const line = formatCsvRow([
            row.id,
            row.type,
            row.severity,
            row.status,
            row.trip?.code ?? '',
            row.driver?.name ?? '',
            row.vehicle?.plate ?? '',
            row.assignee?.name ?? '',
            row.title,
            row.description ?? '',
            row.source ?? '',
            row.delayMinutes ?? '',
            row.deviationKm !== null && row.deviationKm !== undefined ? Number(row.deviationKm) : '',
            row.occurredAt   ? row.occurredAt.toISOString()   : '',
            row.resolvedAt   ? row.resolvedAt.toISOString()   : '',
            row.slaDeadline  ? row.slaDeadline.toISOString()  : '',
          ])
          controller.enqueue(encoder.encode(line + '\n'))
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Tratativas (treatments)
// ---------------------------------------------------------------------------

export type TreatmentsCsvFilters = {
  operatorId?: string
  outcome?:    string
  actionType?: string
}

const TREATMENTS_HEADER = [
  'ID Tratativa',
  'Alerta',
  'Viagem',
  'Operador',
  'Tipo Ação',
  'Notas',
  'Outcome',
  'Criado em',
]

export function streamTreatmentsCsv(filters: TreatmentsCsvFilters): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(BOM + TREATMENTS_HEADER.join(';') + '\n'))

        const conditions: any[] = []
        if (filters.operatorId) conditions.push(eq(treatments.operatorId, filters.operatorId))
        if (filters.outcome)    conditions.push(eq(treatments.outcome,    filters.outcome))
        if (filters.actionType) conditions.push(eq(treatments.actionType, filters.actionType))

        const where = conditions.length ? and(...conditions) : undefined

        // Use raw SQL join — relations metadata for treatments isn't required for export
        const rows = await db
          .select({
            id:         treatments.id,
            alertId:    treatments.alertId,
            tripId:     treatments.tripId,
            operatorId: treatments.operatorId,
            actionType: treatments.actionType,
            notes:      treatments.notes,
            outcome:    treatments.outcome,
            createdAt:  treatments.createdAt,
            alertTitle: alerts.title,
            tripCode:   trips.code,
            operatorName: users.name,
          })
          .from(treatments)
          .leftJoin(alerts, eq(alerts.id, treatments.alertId))
          .leftJoin(trips,  eq(trips.id,  treatments.tripId))
          .leftJoin(users,  eq(users.id,  treatments.operatorId))
          .where(where as any)
          .orderBy(sql`${treatments.createdAt} DESC`)
          .limit(EXPORT_LIMIT)

        for (const row of rows) {
          const line = formatCsvRow([
            row.id,
            row.alertTitle ?? row.alertId ?? '',
            row.tripCode   ?? row.tripId  ?? '',
            row.operatorName ?? row.operatorId ?? '',
            row.actionType ?? '',
            row.notes      ?? '',
            row.outcome    ?? '',
            row.createdAt ? row.createdAt.toISOString() : '',
          ])
          controller.enqueue(encoder.encode(line + '\n'))
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Motoristas (drivers)
// ---------------------------------------------------------------------------

export type MotoristasCsvFilters = {
  status?: string
  search?: string
}

const MOTORISTAS_HEADER = [
  'Código',
  'Nome',
  'Telefone',
  'Email',
  'Status',
  'Score',
  'Base',
  'Entregas Hoje',
  'Atraso Médio (min)',
  'Última Posição (lat)',
  'Última Posição (lng)',
  'Endereço',
]

export function streamMotoristasCsv(filters: MotoristasCsvFilters): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(BOM + MOTORISTAS_HEADER.join(';') + '\n'))

        const conditions: any[] = []
        if (filters.status) conditions.push(eq(drivers.status, filters.status))
        if (filters.search) {
          conditions.push(
            or(
              ilike(drivers.name, `%${filters.search}%`),
              ilike(drivers.code, `%${filters.search}%`),
            )!,
          )
        }

        const where = conditions.length ? and(...conditions) : undefined

        const rows = await db
          .select()
          .from(drivers)
          .where(where as any)
          .orderBy(sql`${drivers.name} ASC`)
          .limit(EXPORT_LIMIT)

        for (const row of rows) {
          const line = formatCsvRow([
            row.code,
            row.name,
            row.phone ?? '',
            row.email ?? '',
            row.status,
            row.operationalScore,
            row.base ?? '',
            row.deliveriesToday,
            row.avgDelayMinutes,
            row.lat !== null && row.lat !== undefined ? Number(row.lat) : '',
            row.lng !== null && row.lng !== undefined ? Number(row.lng) : '',
            row.address ?? '',
          ])
          controller.enqueue(encoder.encode(line + '\n'))
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })
}

// Re-export for caller convenience (vehicles import surface unused publicly)
void vehicles
