/**
 * Phase 16 — docas SPX (carregamento/descarga) → geofences de estação.
 *
 * Cada viagem SPX tem estação de ORIGEM (carregamento) e DESTINO (descarga).
 * A cerca virtual ("geofence") de cada estação vem do portal SPX via
 *   POST /api/line_haul/agency/trip/check_info_log  body { station_id }
 * → { station_latitude, station_longitude, station_range }  (raio em metros).
 * O geofence é por ESTAÇÃO (station_id), não por rota — rotas compartilham docas.
 *
 * `collectStationGeofences()` só LÊ (SPX) e devolve a lista — sem tocar o banco
 * (usado pelo dry-run). `syncSpxGeofences()` faz o upsert em `geofences` por
 * station_id (type 'doca', source 'spx'), círculo virado polígono + geom PostGIS.
 *
 * Fonte dos station_ids: fetchAspRows() → Station_Origem/Station_Destino no
 * formato `[station_id]nome`. A sessão SPX vem do cookie do aspx_credentials
 * (getCookieHeader), o mesmo usado pela aba asp.
 */
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { logger } from '../../lib/logger'
import { circleToPolygon } from '../../lib/geo'
import { fetchAspRows, getCookieHeader, SPX_BASE, DEFAULT_STATION, type AspRow } from './asp.adapter'

const DOCA_COLOR = '#14b8a6' // teal — distingue docas das zonas manuais
const STATION_RE = /^\[(\d+)\](.*)$/

export interface StationGeofence {
  stationId:   number
  name:        string
  lat:         number
  lng:         number
  radius:      number
  coordinates: number[][][]
}
export interface CollectResult {
  stations:  number
  geofences: StationGeofence[]
  skipped:   { stationId: number; name: string; reason: string }[]
  errors:    { stationId: number; error: string }[]
}
export interface SyncResult {
  stations: number
  upserted: number
  skipped:  number
  errors:   number
}
export interface SpxGeofenceOpts { daysBack?: number; daysFwd?: number; station?: string }

/** Extrai station_id→nome distintos das colunas origem/destino das viagens. */
function collectStationIds(rows: AspRow[]): Map<number, string> {
  const m = new Map<number, string>()
  for (const row of rows) {
    for (const field of ['Station_Origem', 'Station_Destino'] as const) {
      const mt = STATION_RE.exec(row[field] || '')
      if (!mt) continue
      const id = Number(mt[1])
      if (id && !m.has(id)) m.set(id, (mt[2] || '').trim())
    }
  }
  return m
}

/** POST check_info_log → geofence da estação. Só o cookie basta (sessão danilo.braga). */
async function fetchStationGeofence(
  cookie: string,
  stationId: number,
): Promise<{ lat: number; lng: number; range: number } | null> {
  const r = await fetch(`${SPX_BASE}/api/line_haul/agency/trip/check_info_log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      Cookie: cookie,
      Origin: SPX_BASE,
      Referer: `${SPX_BASE}/`,
    },
    body: JSON.stringify({ trip_id: 0, station_id: stationId }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!r.ok) throw new Error(`check_info_log HTTP ${r.status}`)
  const j = (await r.json()) as { retcode?: number; message?: string; data?: { list?: any[] } }
  if (j.retcode !== 0) {
    throw new Error(`check_info_log retcode ${j.retcode}: ${j.message || ''} (sessão SPX expirada? aspx-renewal renova)`)
  }
  const rec = j.data?.list?.[0]
  if (!rec) return null
  return {
    lat:   Number(rec.station_latitude) || 0,
    lng:   Number(rec.station_longitude) || 0,
    range: Number(rec.station_range) || 0,
  }
}

/** Lê as docas de todas as rotas da janela — SEM tocar o banco (dry-run). */
export async function collectStationGeofences(opts: SpxGeofenceOpts = {}): Promise<CollectResult> {
  const { rows } = await fetchAspRows({
    daysBack: opts.daysBack ?? 45,
    daysFwd:  opts.daysFwd ?? 15,
    station:  opts.station,
  })
  const stations = collectStationIds(rows)
  const cookie = await getCookieHeader()

  const geofences: StationGeofence[] = []
  const skipped: CollectResult['skipped'] = []
  const errors: CollectResult['errors'] = []

  for (const [stationId, name] of stations) {
    try {
      const geo = await fetchStationGeofence(cookie, stationId)
      if (!geo || geo.range <= 0 || (geo.lat === 0 && geo.lng === 0)) {
        skipped.push({ stationId, name, reason: geo ? `range=${geo.range} lat=${geo.lat} lng=${geo.lng}` : 'sem registro' })
        continue
      }
      geofences.push({
        stationId,
        name,
        lat:    geo.lat,
        lng:    geo.lng,
        radius: geo.range,
        coordinates: circleToPolygon(geo.lng, geo.lat, geo.range),
      })
    } catch (e) {
      errors.push({ stationId, error: (e as Error)?.message ?? String(e) })
    }
  }

  logger.info(
    { window: `${opts.daysBack ?? 45}d/${opts.daysFwd ?? 15}d`, station: opts.station || DEFAULT_STATION, stations: stations.size, ok: geofences.length, skipped: skipped.length, errors: errors.length },
    '[spx-geofences] coletado',
  )
  return { stations: stations.size, geofences, skipped, errors }
}

/** Upsert das docas em `geofences` por station_id (type 'doca', source 'spx'). */
export async function syncSpxGeofences(opts: SpxGeofenceOpts = {}): Promise<SyncResult> {
  const { stations, geofences, skipped, errors } = await collectStationGeofences(opts)

  let upserted = 0
  for (const g of geofences) {
    const wkt = `POLYGON((${g.coordinates[0]!.map(([lng, lat]) => `${lng} ${lat}`).join(',')}))`
    const name = (g.name || `Estação ${g.stationId}`).slice(0, 100)
    const description = `Doca SPX (carregamento/descarga) — estação ${g.stationId}, raio ${g.radius}m`
    await db.execute(sql`
      INSERT INTO geofences
        (name, type, color, coordinates, description, is_active, station_id, radius_m, center_lat, center_lng, source, geom, updated_at)
      VALUES
        (${name}, 'doca', ${DOCA_COLOR}, ${JSON.stringify(g.coordinates)}::jsonb, ${description}, true,
         ${g.stationId}, ${g.radius}, ${g.lat}, ${g.lng}, 'spx', ST_GeomFromText(${wkt}, 4326), now())
      ON CONFLICT (station_id) WHERE station_id IS NOT NULL DO UPDATE SET
        name        = EXCLUDED.name,
        coordinates = EXCLUDED.coordinates,
        description = EXCLUDED.description,
        radius_m    = EXCLUDED.radius_m,
        center_lat  = EXCLUDED.center_lat,
        center_lng  = EXCLUDED.center_lng,
        geom        = EXCLUDED.geom,
        updated_at  = now()
    `)
    upserted++
  }

  logger.info({ stations, upserted, skipped: skipped.length, errors: errors.length }, '[spx-geofences] sync concluído')
  if (errors.length) logger.warn({ errors: errors.slice(0, 10) }, '[spx-geofences] erros por estação')
  return { stations, upserted, skipped: skipped.length, errors: errors.length }
}
