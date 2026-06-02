import { and, eq, inArray, desc } from 'drizzle-orm'
import { db } from '../../db/client'
import { vehicles } from '../../db/schema/vehicles'
import { trips } from '../../db/schema/trips'
import { alerts } from '../../db/schema/alerts'
import { tripEvents } from '../../db/schema/trip-events'
import { drivers } from '../../db/schema/drivers'
import { getTripTimeline } from '../trips/timeline.service'

/**
 * Aggregate everything an operator needs to handle a vehicle: driver,
 * active trip + risk snapshot, recent alerts, and a small timeline tail.
 * One round-trip beats the four the UI was doing.
 */
export async function getVehicleContext(vehicleId: string) {
  const vehicle = await db.query.vehicles.findFirst({
    where: eq(vehicles.id, vehicleId),
  })
  if (!vehicle) return null

  // Active trip — prefer in_progress, then delayed, then most recent
  const activeTrip = await db.query.trips.findFirst({
    where: and(
      eq(trips.vehicleId, vehicleId),
      inArray(trips.status, ['in_progress', 'delayed', 'planned']),
    ),
    orderBy: (t, { asc }) => [asc(t.windowStart)],
    with: {
      driver: { columns: { id: true, name: true, photoUrl: true, code: true, phone: true } },
      client: { columns: { name: true } },
      route:  { columns: { code: true, name: true } },
    },
  })

  // Recent open + recent alerts for the vehicle
  const recentAlerts = activeTrip
    ? await db.query.alerts.findMany({
        where: eq(alerts.tripId, activeTrip.id),
        orderBy: (a) => [desc(a.occurredAt)],
        limit: 5,
      })
    : []

  // Last 8 timeline events for the active trip (full aggregator → take tail)
  const timeline = activeTrip
    ? (await getTripTimeline(activeTrip.id)).slice(-8)
    : []

  // Fallback driver (if vehicle is not on a trip but is assigned)
  let driverDirect: { id: string; name: string; photoUrl: string | null; code: string; phone: string | null } | null = null
  if (!activeTrip) {
    const d = await db.query.drivers.findFirst({
      where: eq(drivers.id, vehicle.driverId ?? '00000000-0000-0000-0000-000000000000'),
      columns: { id: true, name: true, photoUrl: true, code: true, phone: true },
    })
    if (d) driverDirect = d
  }

  return {
    vehicle: {
      id:        vehicle.id,
      plate:     vehicle.plate,
      type:      vehicle.type,
      driverId:  vehicle.driverId,
    },
    driver: activeTrip?.driver ?? driverDirect,
    activeTrip: activeTrip ? {
      id:          activeTrip.id,
      code:        activeTrip.code,
      status:      activeTrip.status,
      slaStatus:   activeTrip.slaStatus,
      origin:      activeTrip.origin,
      destination: activeTrip.destination,
      windowStart: activeTrip.windowStart,
      windowEnd:   activeTrip.windowEnd,
      eta:         activeTrip.eta,
      progressPct: activeTrip.progressPct,
      clientName:  activeTrip.client?.name ?? '',
      routeCode:   activeTrip.route?.code ?? '',
      riskScore:   activeTrip.riskScore,
      riskLevel:   activeTrip.riskLevel,
      riskFactors: activeTrip.riskFactors,
    } : null,
    recentAlerts: recentAlerts.map((a) => ({
      id:           a.id,
      type:         a.type,
      severity:     a.severity,
      status:       a.status,
      priority:     a.priority,
      title:        a.title,
      occurredAt:   a.occurredAt,
      slaDeadline:  a.slaDeadline,
    })),
    timeline,
  }
}
