import { and, gte, inArray, isNotNull } from 'drizzle-orm'
import { db } from '../../db/client'
import { alerts } from '../../db/schema/alerts'
import { trips } from '../../db/schema/trips'

export type HeatmapLayer = 'alertas' | 'atrasos' | 'desvios' | 'paradas' | 'risco'
export type HeatmapPeriod = 'today' | '7d' | '30d'

export interface HeatmapPoint {
  lat:    number
  lng:    number
  weight: number   // 1-10 typical
}

export interface HeatmapPayload {
  layer:  HeatmapLayer
  period: HeatmapPeriod
  count:  number
  bounds: [[number, number], [number, number]] | null  // [[minLng,minLat],[maxLng,maxLat]]
  points: HeatmapPoint[]
}

function periodCutoff(p: HeatmapPeriod): Date {
  const d = new Date()
  if (p === 'today') d.setHours(0, 0, 0, 0)
  else if (p === '7d') d.setDate(d.getDate() - 7)
  else                 d.setDate(d.getDate() - 30)
  return d
}

const LAYER_TO_ALERT_TYPES: Partial<Record<HeatmapLayer, string[]>> = {
  atrasos: ['atraso_critico', 'entrega_fora_janela'],
  desvios: ['desvio_nao_autorizado'],
  paradas: ['parada_nao_planejada', 'tempo_parada_elevado'],
}

const SEVERITY_WEIGHT: Record<string, number> = {
  critico: 5,
  medio:   3,
  baixo:   1,
}

const RISK_WEIGHT: Record<string, number> = {
  critico: 5,
  alto:    3,
  medio:   2,
  baixo:   1,
}

/** Quantize lat/lng to ~250m grid so dense clusters bubble up without overwhelming the renderer. */
function quantize(lat: number, lng: number): string {
  return `${lat.toFixed(3)}|${lng.toFixed(3)}`
}

export async function getHeatmap(layer: HeatmapLayer, period: HeatmapPeriod): Promise<HeatmapPayload> {
  const cutoff = periodCutoff(period)
  const aggregator = new Map<string, HeatmapPoint>()

  if (layer === 'risco') {
    // Live: current at-risk trips. Risk lives on trips; use origin coords as anchor (best signal we have without GPS history).
    const rows = await db.select({
      lat:   trips.originLat,
      lng:   trips.originLng,
      level: trips.riskLevel,
    }).from(trips).where(and(
      inArray(trips.status, ['in_progress', 'planned', 'delayed']),
      isNotNull(trips.riskLevel),
    ))
    for (const r of rows) {
      if (!r.lat || !r.lng || !r.level) continue
      const lat = Number(r.lat); const lng = Number(r.lng)
      const w = RISK_WEIGHT[r.level] ?? 1
      const key = quantize(lat, lng)
      const cur = aggregator.get(key)
      if (cur) cur.weight += w
      else aggregator.set(key, { lat, lng, weight: w })
    }
  } else {
    // Alert-based layers
    const conditions = [
      gte(alerts.occurredAt, cutoff),
      isNotNull(alerts.lat),
      isNotNull(alerts.lng),
    ]
    const types = LAYER_TO_ALERT_TYPES[layer]
    if (types && types.length > 0) {
      conditions.push(inArray(alerts.type, types))
    }
    const rows = await db.select({
      lat:      alerts.lat,
      lng:      alerts.lng,
      severity: alerts.severity,
    }).from(alerts).where(and(...conditions))
    for (const r of rows) {
      if (!r.lat || !r.lng) continue
      const lat = Number(r.lat); const lng = Number(r.lng)
      const w = SEVERITY_WEIGHT[r.severity] ?? 1
      const key = quantize(lat, lng)
      const cur = aggregator.get(key)
      if (cur) cur.weight += w
      else aggregator.set(key, { lat, lng, weight: w })
    }
  }

  const points = [...aggregator.values()]
  let bounds: HeatmapPayload['bounds'] = null
  if (points.length > 0) {
    let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity
    for (const p of points) {
      if (p.lat < minLat) minLat = p.lat
      if (p.lat > maxLat) maxLat = p.lat
      if (p.lng < minLng) minLng = p.lng
      if (p.lng > maxLng) maxLng = p.lng
    }
    bounds = [[minLng, minLat], [maxLng, maxLat]]
  }

  return { layer, period, count: points.length, bounds, points }
}
