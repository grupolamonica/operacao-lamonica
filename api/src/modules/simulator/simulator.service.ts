import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '../../db/client'
import { trips } from '../../db/schema/trips'
import { alerts } from '../../db/schema/alerts'
import { routes as routesTable } from '../../db/schema/routes'
import { haversine, aggregateRouteStats, compositeScore, estimateTollBRL, type HistoricalTripStat } from './simulator.engine'

const MATCH_RADIUS_KM = 50  // origin & destination must be within this radius to count as "the same trip"

export interface SimRequest {
  origin:      { lat: number; lng: number }
  destination: { lat: number; lng: number }
  vehicleType?: string | null
}

export interface RouteAlternative {
  routeId:        string | null
  routeCode:      string
  routeName:      string
  sampleCount:    number
  distanceKm:     number
  durationMin:    number
  slaPct:         number
  riskAvg:        number
  alertsPerTrip:  number
  tollEstBRL:     number
  score:          number
  isFastest:      boolean
  isCheapest:     boolean
  isMostReliable: boolean
}

export interface SimResponse {
  theoreticalMinKm: number
  alternatives:     RouteAlternative[]
  noHistoryMatch:   boolean
}

/**
 * Find historical trips whose origin/destination are within MATCH_RADIUS_KM
 * of the request, group by route, aggregate stats, rank alternatives.
 *
 * When no history matches (cold-start), we still return a single synthetic
 * "Rota direta" entry computed from the haversine distance so the UI has
 * something to show.
 */
export async function simulateRoutes(req: SimRequest): Promise<SimResponse> {
  const theoreticalMin = haversine(req.origin.lat, req.origin.lng, req.destination.lat, req.destination.lng)

  // Pull a broad swath of completed trips with both origin + destination geocoded.
  const candidates = await db.select({
    id:            trips.id,
    routeId:       trips.routeId,
    originLat:     trips.originLat,
    originLng:     trips.originLng,
    destLat:       trips.destLat,
    destLng:       trips.destLng,
    windowEnd:     trips.windowEnd,
    arrivedAt:     trips.arrivedAt,
    departedAt:    trips.departedAt,
    distanceTotal: trips.distanceTotal,
    riskScore:     trips.riskScore,
  }).from(trips).where(and(
    isNotNull(trips.originLat),
    isNotNull(trips.destLat),
    isNotNull(trips.routeId),
  ))

  // Filter by proximity to requested endpoints
  const matched = candidates.filter((t) => {
    const oLat = Number(t.originLat), oLng = Number(t.originLng)
    const dLat = Number(t.destLat),   dLng = Number(t.destLng)
    const oDist = haversine(req.origin.lat,      req.origin.lng,      oLat, oLng)
    const dDist = haversine(req.destination.lat, req.destination.lng, dLat, dLng)
    return oDist <= MATCH_RADIUS_KM && dDist <= MATCH_RADIUS_KM
  })

  if (matched.length === 0) {
    // Cold-start: project a single "direct" alternative purely from geometry
    const distKm = theoreticalMin * 1.25  // 25% padding for road overhead
    const timeMin = (distKm / 50) * 60    // 50km/h assumed urban+highway mix
    return {
      theoreticalMinKm: theoreticalMin,
      noHistoryMatch:   true,
      alternatives: [{
        routeId:        null,
        routeCode:      'DIRETO',
        routeName:      'Rota direta (sem histórico)',
        sampleCount:    0,
        distanceKm:     Math.round(distKm * 10) / 10,
        durationMin:    Math.round(timeMin),
        slaPct:         100,
        riskAvg:        0,
        alertsPerTrip:  0,
        tollEstBRL:     estimateTollBRL(distKm, req.vehicleType),
        score:          0,
        isFastest:      true,
        isCheapest:     true,
        isMostReliable: true,
      }],
    }
  }

  // Count alerts per matched trip
  const tripIds = matched.map((t) => t.id)
  const alertRows = await db.select({ tripId: alerts.tripId }).from(alerts).where(inArray(alerts.tripId, tripIds))
  const alertsByTrip = new Map<string, number>()
  for (const a of alertRows) {
    if (!a.tripId) continue
    alertsByTrip.set(a.tripId, (alertsByTrip.get(a.tripId) ?? 0) + 1)
  }

  // Group by route
  const byRoute = new Map<string, typeof matched>()
  for (const t of matched) {
    if (!t.routeId) continue
    const cur = byRoute.get(t.routeId) ?? []
    cur.push(t)
    byRoute.set(t.routeId, cur)
  }

  const routeIds = [...byRoute.keys()]
  const routeMeta = routeIds.length > 0
    ? await db.select({ id: routesTable.id, code: routesTable.code, name: routesTable.name }).from(routesTable).where(inArray(routesTable.id, routeIds))
    : []
  const routeMetaById = new Map(routeMeta.map((r) => [r.id, r]))

  const alternatives: RouteAlternative[] = []
  for (const [routeId, tripsList] of byRoute) {
    const stats: HistoricalTripStat[] = tripsList.map((t) => {
      const dist = t.distanceTotal ? Number(t.distanceTotal) : null
      const durationMin = t.departedAt && t.arrivedAt
        ? (t.arrivedAt.getTime() - t.departedAt.getTime()) / 60_000
        : null
      const onTime = t.arrivedAt
        ? t.arrivedAt <= t.windowEnd
        : null
      return {
        distance:    dist,
        durationMin,
        onTime,
        riskScore:   t.riskScore ?? null,
        alertsCount: alertsByTrip.get(t.id) ?? 0,
      }
    })
    const agg = aggregateRouteStats(stats)
    const meta = routeMetaById.get(routeId)
    const score = compositeScore(agg, theoreticalMin)
    alternatives.push({
      routeId,
      routeCode:      meta?.code ?? '—',
      routeName:      meta?.name ?? '—',
      sampleCount:    agg.trips,
      distanceKm:     Math.round((agg.distAvg || theoreticalMin * 1.25) * 10) / 10,
      durationMin:    Math.round(agg.timeAvgMin || (theoreticalMin * 1.25 / 50) * 60),
      slaPct:         agg.slaPct,
      riskAvg:        agg.riskAvg,
      alertsPerTrip:  Math.round(agg.alertsPerTrip * 10) / 10,
      tollEstBRL:     estimateTollBRL(agg.distAvg || theoreticalMin * 1.25, req.vehicleType),
      score,
      isFastest:      false,
      isCheapest:     false,
      isMostReliable: false,
    })
  }

  alternatives.sort((a, b) => a.score - b.score)

  // Tag the top contender in each axis
  if (alternatives.length > 0) {
    const fastest    = [...alternatives].sort((a, b) => a.durationMin - b.durationMin)[0]!
    const cheapest   = [...alternatives].sort((a, b) => a.tollEstBRL - b.tollEstBRL)[0]!
    const reliable   = [...alternatives].sort((a, b) => b.slaPct - a.slaPct)[0]!
    fastest.isFastest = true
    cheapest.isCheapest = true
    reliable.isMostReliable = true
  }

  return {
    theoreticalMinKm: Math.round(theoreticalMin * 10) / 10,
    noHistoryMatch:   false,
    alternatives,
  }
}
