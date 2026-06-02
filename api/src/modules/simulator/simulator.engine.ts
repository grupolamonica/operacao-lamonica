// Route simulator engine — pure functions. No DB, no IO.
// History-driven: given a set of past trips between similar endpoints, we
// derive distance/time/SLA/risk projections. Not a routing-API replacement.

const EARTH_R_KM = 6371

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Haversine great-circle distance in km. */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_R_KM * c
}

export interface HistoricalTripStat {
  distance:    number | null   // km
  durationMin: number | null
  onTime:      boolean | null  // null = not completed
  riskScore:   number | null
  alertsCount: number
}

export interface RouteStats {
  trips:       number
  distAvg:     number     // km
  timeAvgMin:  number
  slaPct:      number     // 0-100
  riskAvg:     number     // 0-100
  alertsPerTrip: number
}

export function aggregateRouteStats(history: HistoricalTripStat[]): RouteStats {
  const trips = history.length
  if (trips === 0) {
    return { trips: 0, distAvg: 0, timeAvgMin: 0, slaPct: 100, riskAvg: 0, alertsPerTrip: 0 }
  }
  const distSamples = history.map((h) => h.distance).filter((d): d is number => d != null && d > 0)
  const timeSamples = history.map((h) => h.durationMin).filter((d): d is number => d != null && d > 0)
  const completed   = history.filter((h) => h.onTime != null)
  const onTime      = completed.filter((h) => h.onTime === true).length
  const riskSamples = history.map((h) => h.riskScore).filter((r): r is number => r != null)

  return {
    trips,
    distAvg:       distSamples.length > 0 ? distSamples.reduce((s, x) => s + x, 0) / distSamples.length : 0,
    timeAvgMin:    timeSamples.length > 0 ? timeSamples.reduce((s, x) => s + x, 0) / timeSamples.length : 0,
    slaPct:        completed.length > 0 ? Math.round((onTime / completed.length) * 100) : 100,
    riskAvg:       riskSamples.length > 0 ? Math.round(riskSamples.reduce((s, x) => s + x, 0) / riskSamples.length) : 0,
    alertsPerTrip: history.reduce((s, h) => s + h.alertsCount, 0) / trips,
  }
}

/**
 * Composite score that ranks alternatives. Lower is better.
 * 60% SLA-deficit weight, 20% risk, 10% time penalty vs theoretical minimum,
 * 10% alerts-per-trip. Tunable.
 */
export function compositeScore(stats: RouteStats, theoreticalMinKm: number, kmhAssumed = 50): number {
  const slaDeficit = 100 - stats.slaPct                                  // 0..100
  const detourPct  = stats.distAvg > 0 ? Math.max(0, ((stats.distAvg - theoreticalMinKm) / theoreticalMinKm) * 100) : 0
  const timePenalty = Math.max(0, stats.timeAvgMin - (stats.distAvg / kmhAssumed) * 60)
  const alertsScaled = Math.min(50, stats.alertsPerTrip * 10)
  return Math.round(
    0.60 * slaDeficit +
    0.20 * stats.riskAvg +
    0.10 * Math.min(100, detourPct + timePenalty / 2) +
    0.10 * alertsScaled,
  )
}

/** Simple toll estimate — heuristic R$/km by vehicle class. Used when no toll DB is available. */
export function estimateTollBRL(distanceKm: number, vehicleType?: string | null): number {
  const ratePerKm = vehicleType === 'Furgão' ? 0.06 : vehicleType === 'VUC' ? 0.04 : 0.05
  return Math.round(distanceKm * ratePerKm * 100) / 100
}
