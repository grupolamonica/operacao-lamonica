import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { redis } from '../redis/client'
import { geofences } from '../db/schema/geofences'
import { geofenceEvents } from '../db/schema/geofences'
import { tripEvents } from '../db/schema/trip-events'
import { logger } from '../lib/logger'

const TIMELINE_BROADCAST_CHANNEL = 'timeline:new'

// Ray-casting point-in-polygon (works on GeoJSON Polygon outer ring).
function pointInPolygon(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!, yi = ring[i]![1]!
    const xj = ring[j]![0]!, yj = ring[j]![1]!
    const intersect = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// Loaded once; refreshed every 60s. Avoids hitting DB on every position tick.
let activeFencesCache: Array<{ id: string; name: string; ring: number[][] }> = []
let fencesLoadedAt = 0
const FENCES_TTL_MS = 60_000

async function loadActiveFences() {
  const now = Date.now()
  if (now - fencesLoadedAt < FENCES_TTL_MS && activeFencesCache.length > 0) return activeFencesCache
  const rows = await db.select().from(geofences).where(eq(geofences.isActive, true))
  activeFencesCache = rows.flatMap((f) => {
    const coords = (f.coordinates as { coordinates?: number[][][] } | number[][][]) as any
    // Support both bare [[[lng,lat],...]] and full GeoJSON { type:'Polygon', coordinates:[[[...]]] }
    const ring = Array.isArray(coords) ? coords[0] : coords?.coordinates?.[0]
    if (!ring || !Array.isArray(ring)) return []
    return [{ id: f.id, name: f.name, ring: ring as number[][] }]
  })
  fencesLoadedAt = now
  return activeFencesCache
}

/**
 * Detect geofence entry/exit transitions for a vehicle position.
 * Emits trip_events of type geofence_entered / geofence_exited, mirrors to
 * legacy geofence_events table, and publishes to Redis for WS fan-out.
 */
export async function processGeofenceDetection(opts: {
  vehicleId: string
  tripId:    string
  lat:       number
  lng:       number
  capturedAt: string
}): Promise<void> {
  const fences = await loadActiveFences()
  if (fences.length === 0) return

  const inside = new Set<string>()
  for (const f of fences) {
    if (pointInPolygon(opts.lng, opts.lat, f.ring)) inside.add(f.id)
  }

  // Previous state from Redis (set of fence IDs the vehicle was inside last tick)
  const stateKey = `geofence:state:${opts.vehicleId}`
  const prevRaw = await redis.get(stateKey)
  const prev: Set<string> = prevRaw ? new Set(JSON.parse(prevRaw)) : new Set()

  const entered: string[] = []
  const exited:  string[] = []
  for (const id of inside) if (!prev.has(id)) entered.push(id)
  for (const id of prev)   if (!inside.has(id)) exited.push(id)

  if (entered.length === 0 && exited.length === 0) {
    // No transition — refresh TTL on cached state
    if (prev.size > 0) await redis.expire(stateKey, 7200)
    return
  }

  await redis.set(stateKey, JSON.stringify([...inside]), 'EX', 7200)

  const transitions: Array<{ type: 'geofence_entered' | 'geofence_exited'; fenceId: string }> = [
    ...entered.map((id) => ({ type: 'geofence_entered' as const, fenceId: id })),
    ...exited.map((id)  => ({ type: 'geofence_exited'  as const, fenceId: id })),
  ]

  for (const tx of transitions) {
    const fence = fences.find((f) => f.id === tx.fenceId)
    const fenceName = fence?.name ?? 'geofence'

    // Write to trip_events (timeline source of truth)
    const [inserted] = await db.insert(tripEvents).values({
      tripId:     opts.tripId,
      eventType:  tx.type,
      occurredAt: new Date(opts.capturedAt),
      lat:        String(opts.lat),
      lng:        String(opts.lng),
      geofenceId: tx.fenceId,
      metadata:   { fenceName, vehicleId: opts.vehicleId },
    }).returning()

    // Mirror to legacy geofence_events for backwards compat
    await db.insert(geofenceEvents).values({
      geofenceId: tx.fenceId,
      vehicleId:  opts.vehicleId,
      tripId:     opts.tripId,
      eventType:  tx.type === 'geofence_entered' ? 'entry' : 'exit',
      lat:        String(opts.lat),
      lng:        String(opts.lng),
      occurredAt: new Date(opts.capturedAt),
    }).catch(() => {/* legacy mirror is best-effort */})

    await redis.publish(TIMELINE_BROADCAST_CHANNEL, JSON.stringify({
      type:    'timeline:new',
      tripId:  opts.tripId,
      eventId: inserted!.id,
      kind:    tx.type,
      fenceId: tx.fenceId,
    }))

    logger.info({ tripId: opts.tripId, type: tx.type, fenceId: tx.fenceId }, 'geofence transition')
  }
}
