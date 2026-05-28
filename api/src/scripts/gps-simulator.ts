/**
 * GPS Simulator — simulates 20 vehicles moving around São Paulo in real-time.
 * Sends position updates to POST /api/telemetry/ingest every 3s per vehicle.
 *
 * Usage:
 *   DATABASE_URL=... bun run src/scripts/gps-simulator.ts
 *   API_URL=http://localhost:3000 TELEMETRY_API_KEY=dev-telemetry-key DATABASE_URL=... bun run src/scripts/gps-simulator.ts
 */

import { db } from '../db/client'
import { vehicles } from '../db/schema/vehicles'
import { trips } from '../db/schema/trips'
import { eq, inArray } from 'drizzle-orm'

const API_URL = process.env.API_URL ?? 'http://localhost:3000'
const API_KEY  = process.env.TELEMETRY_API_KEY ?? 'dev-telemetry-key'
const INTERVAL_MS = 3000  // send every 3s per vehicle

// São Paulo bounding box — vehicles roam within this area
const SP_BOUNDS = { minLat: -23.65, maxLat: -23.48, minLng: -46.75, maxLng: -46.55 }

// Realistic delivery routes: from → to
const ROUTES = [
  { from: [-23.5505, -46.6333], to: [-23.5200, -46.6100] }, // SP Centro → Pinheiros
  { from: [-23.5505, -46.6333], to: [-23.5700, -46.6500] }, // SP Centro → Santo André
  { from: [-23.4800, -46.6500], to: [-23.5500, -46.6800] }, // Guarulhos → Osasco
  { from: [-23.5200, -46.5900], to: [-23.5800, -46.5600] }, // Zona Leste → ABC
  { from: [-23.5400, -46.7200], to: [-23.4900, -46.6800] }, // Zona Oeste → Zona Norte
]

type VehicleState = {
  id: string
  lat: number
  lng: number
  destLat: number
  destLng: number
  speed: number
  heading: number
  route: typeof ROUTES[number]
}

function clamp(val: number, min: number, max: number) { return Math.max(min, Math.min(max, val)) }
function randf(min: number, max: number) { return min + Math.random() * (max - min) }
function angleTo(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = lng2 - lng1
  const dLat = lat2 - lat1
  return (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360
}
function distanceDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return Math.sqrt((lat2 - lat1) ** 2 + (lng2 - lng1) ** 2)
}

async function loadVehicles(): Promise<VehicleState[]> {
  // Only simulate vehicles that have active (in_progress) trips
  const activeTrips = await db.select({ vehicleId: trips.vehicleId })
    .from(trips)
    .where(eq(trips.status, 'in_progress'))
  const activeIds = activeTrips.map(t => t.vehicleId).filter((v): v is string => !!v)

  if (activeIds.length === 0) {
    console.warn('[sim] No in_progress trips found — simulating all vehicles')
    const allVeh = await db.select({ id: vehicles.id }).from(vehicles).limit(20)
    return allVeh.map((v, i) => initVehicle(v.id, i))
  }

  const veh = await db.select({ id: vehicles.id }).from(vehicles)
    .where(inArray(vehicles.id, activeIds.slice(0, 20)))
  return veh.map((v, i) => initVehicle(v.id, i))
}

function initVehicle(id: string, idx: number): VehicleState {
  const route = ROUTES[idx % ROUTES.length]!
  // Start near the route origin with small random offset
  const lat = route.from[0]! + randf(-0.02, 0.02)
  const lng = route.from[1]! + randf(-0.02, 0.02)
  return {
    id,
    lat: clamp(lat, SP_BOUNDS.minLat, SP_BOUNDS.maxLat),
    lng: clamp(lng, SP_BOUNDS.minLng, SP_BOUNDS.maxLng),
    destLat: route.to[0]!,
    destLng: route.to[1]!,
    speed: randf(30, 80),
    heading: angleTo(lat, lng, route.to[0]!, route.to[1]!),
    route,
  }
}

function stepVehicle(v: VehicleState): VehicleState {
  const dist = distanceDeg(v.lat, v.lng, v.destLat, v.destLng)

  // If near destination, pick a new route
  if (dist < 0.005) {
    const newRoute = ROUTES[Math.floor(Math.random() * ROUTES.length)]!
    return {
      ...v,
      destLat: newRoute.to[0]!,
      destLng: newRoute.to[1]!,
      route: newRoute,
      speed: randf(30, 80),
    }
  }

  // Move toward destination + slight jitter (simulates road wobble)
  const stepSize = 0.0003 + randf(-0.0001, 0.0001) // ~33m per step
  const dLat = (v.destLat - v.lat) / dist * stepSize
  const dLng = (v.destLng - v.lng) / dist * stepSize

  const newLat = clamp(v.lat + dLat + randf(-0.00005, 0.00005), SP_BOUNDS.minLat, SP_BOUNDS.maxLat)
  const newLng = clamp(v.lng + dLng + randf(-0.00005, 0.00005), SP_BOUNDS.minLng, SP_BOUNDS.maxLng)

  return {
    ...v,
    lat: newLat,
    lng: newLng,
    heading: angleTo(v.lat, v.lng, newLat, newLng),
    speed: clamp(v.speed + randf(-5, 5), 5, 100),
  }
}

async function sendPosition(v: VehicleState): Promise<void> {
  const res = await fetch(`${API_URL}/api/telemetry/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({
      vehicleId:  v.id,
      lat:        Number(v.lat.toFixed(6)),
      lng:        Number(v.lng.toFixed(6)),
      speed:      Math.round(v.speed),
      heading:    Math.round(v.heading),
      capturedAt: new Date().toISOString(),
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.warn(`[sim] vehicle ${v.id.slice(0, 8)} ingest failed ${res.status}: ${body.slice(0, 80)}`)
  }
}

async function main() {
  console.log(`[sim] Starting GPS simulator → ${API_URL}`)
  console.log('[sim] Loading vehicles...')

  const states = await loadVehicles()
  console.log(`[sim] Simulating ${states.length} vehicles. Interval: ${INTERVAL_MS}ms`)

  const current = new Map<string, VehicleState>(states.map(v => [v.id, v]))

  // Stagger initial sends to avoid thundering herd
  let offset = 0
  for (const [id] of current) {
    const delay = offset++ * (INTERVAL_MS / states.length)
    setTimeout(async function tick() {
      const v = current.get(id)!
      const next = stepVehicle(v)
      current.set(id, next)
      await sendPosition(next).catch(() => {})
      setTimeout(tick, INTERVAL_MS)
    }, delay)
  }

  console.log('[sim] Running. Press Ctrl+C to stop.')
}

main().catch(e => { console.error('[sim] Fatal:', e); process.exit(1) })
