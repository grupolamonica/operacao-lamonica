/**
 * Phase 15 — sync CONSTANTE das viagens Shopee (SPX, aba asp ao vivo) para a
 * tabela `trips` do Supabase do Ranking (Lamonica Ranking, qbwazymqhfunlhnikbla).
 *
 * Roda no worker BullMQ (job 'rank-sync', a cada 10min). Mesmo motor do
 * GET /api/spx/asp (fetchAspRows in-process — sem HTTP, sem API key). Escreve via rankSupabase
 * (service_role). O front do ride-rank lê `trips` e funde com o histórico da
 * planilha, mantendo o ranking atualizado com os dados que a Torre já coleta.
 *
 * Mapeamento asp → schema que o pipeline do ride-rank consome (SheetTrip):
 *   LH Trip Number            → trip_number
 *   Driver ID `[id]nome`      → driver_id + driver_name
 *   Status (tt_trip_status)   → status_agrupado (Completed/Unloaded=FECHADA,
 *                               Cancelled=CANCELADA, demais='' = em andamento, não pontua)
 *   ETA ORIGEM/DESTINO PROG×REAL → eta_scheduled_origin_edited/eta_realizado/
 *                               eta_destination_edited/eta_destino_realizado
 *   (datas já vêm em 'DD/MM/YYYY HH:MM' BRT — formato que o parseDateBR aceita)
 */
import { fetchAspRows, type AspRow } from './asp.adapter'
import { getRankSupabase } from '../../modules/ranking/ranking.supabase'
import { logger } from '../../lib/logger'

// Status SPX que contam como viagem fechada (pontuável) no ranking.
const FECHADA = new Set(['Completed', 'Unloaded'])
const stripStation = (s: string) => (s || '').replace(/^\[\d+\]/, '').trim()

interface RankTripRow {
  trip_number: string
  driver_id: string
  driver_name: string
  status_agrupado: string
  status_operacional: string
  origin_station_code: string
  destination_station_code: string
  eta_scheduled_origin_edited: string
  eta_realizado: string
  eta_destination_edited: string
  eta_destino_realizado: string
  sta_origin_date: string
  vehicle_plate_number: string
  data_source: string
}

function mapAspToTrip(r: AspRow): RankTripRow | null {
  const trip_number = (r['LH Trip Number'] || '').trim()
  if (!trip_number) return null
  const driverRaw = (r['Driver ID'] || '').trim()
  const m = driverRaw.match(/^\[(\d+)\]\s*(.*)$/)
  const driver_id = m ? m[1] : ''
  const driver_name = m ? m[2].trim() : driverRaw
  const status = (r['Status'] || '').trim()
  const status_agrupado = FECHADA.has(status) ? 'FECHADA' : status === 'Cancelled' ? 'CANCELADA' : ''
  return {
    trip_number,
    driver_id,
    driver_name,
    status_agrupado,
    status_operacional: r['Status Operacional'] || '',
    origin_station_code: stripStation(r['Station_Origem'] || ''),
    destination_station_code: stripStation(r['Station_Destino'] || ''),
    eta_scheduled_origin_edited: r['ETA ORIGEM PROGRAMADO'] || '',
    eta_realizado: r['ETA ORIGEM REAL'] || '',
    eta_destination_edited: r['ETA DESTINO PROGRAMADO'] || '',
    eta_destino_realizado: r['ETA DESTINO REAL'] || '',
    sta_origin_date: r['ETA ORIGEM PROGRAMADO'] || '',
    vehicle_plate_number: r['Vehicle Plate Number'] || '',
    data_source: 'spx_asp',
  }
}

export async function syncRankTrips(
  opts: { daysBack?: number; daysFwd?: number } = {},
): Promise<{ fetched: number; upserted: number; errors: string[] }> {
  const { rows, errors } = await fetchAspRows({ daysBack: opts.daysBack ?? 45, daysFwd: opts.daysFwd ?? 15 })

  const seen = new Set<string>()
  const trips: RankTripRow[] = []
  for (const r of rows) {
    const t = mapAspToTrip(r)
    if (t && !seen.has(t.trip_number)) {
      seen.add(t.trip_number)
      trips.push(t)
    }
  }

  const db = getRankSupabase()
  const now = new Date().toISOString()
  let upserted = 0
  for (let i = 0; i < trips.length; i += 200) {
    const batch = trips.slice(i, i + 200).map((t) => ({ ...t, updated_at: now }))
    const { error } = await db.from('trips').upsert(batch as any, { onConflict: 'trip_number' })
    if (error) throw new Error(`rank trips upsert: ${error.message}`)
    upserted += batch.length
  }

  const errs = errors.map((e) => `${e.tab}: ${e.error}`)
  logger.info({ fetched: rows.length, upserted, errors: errs }, '[rank-sync] trips do SPX sincronizadas para o ranking')
  return { fetched: rows.length, upserted, errors: errs }
}
