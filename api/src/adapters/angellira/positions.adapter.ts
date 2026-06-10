/**
 * Positions adapter (D-12-30) — puxa posições ao vivo do Angellira (busca-geral)
 * e appenda em driver_positions (trilha do mapa, Phase 14).
 *
 * Join placa → motorista via trips VIVOS (sheet_cavalo/sheet_motorista): as
 * fontes vivas (painel/cargas/monitoring) não populam vehicle_id/driver_id —
 * o join antigo por FK casava 0 e a trilha nunca acumulava.
 *
 * dataPosicao = `dt` da API (epoch em segundos, timestamp real da posição) —
 * com o UNIQUE(motorista_norm, data_posicao) o veículo parado não duplica.
 * Anti-ruído extra: pula o insert quando lat/lng é idêntico à última posição
 * gravada do motorista.
 *
 * geom PostGIS é gerenciado por SQL manual (Phase 10) — após o insert fazemos
 * backfill do geom a partir de lat/lng (consumidores PostGIS continuam ok).
 */
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { driverPositions } from '../../db/schema/driver-positions'
import { getMapsToken, mapsUrl } from './auth'

function norm(s: string): string {
  return (s || '').toString().trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

interface BuscaGeralItem { placa?: string; lat?: number | string; lng?: number | string; pos?: string; dt?: number | string }

export interface PositionsResult { fetched: number; matched: number; inserted: number; ts: string }

export async function syncPositions(): Promise<PositionsResult> {
  const token = await getMapsToken()
  const res = await fetch(mapsUrl(token, 'busca-geral'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
    body: new URLSearchParams({ diasSemViagem: '60' }).toString(),
  })
  if (!res.ok) throw new Error(`Angellira busca-geral falhou: ${res.status}`)
  const json = (await res.json()) as { values?: BuscaGeralItem[] }
  const items = (json.values ?? []).filter((v) => v.placa && v.lat != null && v.lng != null)

  // Mapa placa(normalizada) → motorista das viagens VIVAS (qualquer source)
  const plateToDriver = new Map<string, string>()
  const rows = (await db.execute(sql`
    SELECT DISTINCT upper(replace(replace(sheet_cavalo, '-', ''), ' ', '')) AS plate_key,
           sheet_motorista AS driver_name
    FROM trips
    WHERE status = 'in_progress' AND sheet_cavalo IS NOT NULL AND sheet_motorista IS NOT NULL
  `)) as unknown as Array<{ plate_key: string; driver_name: string }>
  for (const r of rows) plateToDriver.set(r.plate_key, r.driver_name)

  // Última posição gravada por motorista — veículo parado não gera ponto novo
  const lastByNorm = new Map<string, { lat: number; lng: number }>()
  const last = (await db.execute(sql`
    SELECT DISTINCT ON (motorista_norm) motorista_norm, lat, lng
    FROM driver_positions
    ORDER BY motorista_norm, data_posicao DESC
  `)) as unknown as Array<{ motorista_norm: string; lat: string | null; lng: string | null }>
  for (const r of last) if (r.lat != null && r.lng != null) lastByNorm.set(r.motorista_norm, { lat: Number(r.lat), lng: Number(r.lng) })

  const now = new Date()
  const toInsert: Array<typeof driverPositions.$inferInsert> = []
  for (const v of items) {
    const plateKey = (v.placa || '').toUpperCase().replace(/[-\s]/g, '')
    const motorista = plateToDriver.get(plateKey)
    if (!motorista) continue // só registra veículos em viagem ativa no Torre
    const mNorm = norm(motorista)
    const prev = lastByNorm.get(mNorm)
    if (prev && prev.lat === Number(v.lat) && prev.lng === Number(v.lng)) continue
    // dt = epoch em segundos (timestamp real da posição); fallback = agora
    const dtNum = Number(v.dt)
    const dataPosicao = Number.isFinite(dtNum) && dtNum > 1e9 && dtNum < 1e11 ? new Date(dtNum * 1000) : now
    toInsert.push({
      motorista,
      motoristaNorm: mNorm,
      dataPosicao,
      posicaoRaw:    String(v.pos ?? ''),
      veiculo:       String(v.placa ?? '').trim(),
      lat:           v.lat != null ? String(v.lat) : null,
      lng:           v.lng != null ? String(v.lng) : null,
      geocoded:      true,
    })
  }

  let inserted = 0
  if (toInsert.length) {
    const res2 = await db.insert(driverPositions).values(toInsert)
      .onConflictDoNothing({ target: [driverPositions.motoristaNorm, driverPositions.dataPosicao] })
      .returning({ id: driverPositions.id })
    inserted = (res2 as unknown as Array<{ id: string }>).length
    // geom é coluna gerida por SQL manual — backfill p/ os consumidores PostGIS
    await db.execute(sql`
      UPDATE driver_positions
      SET geom = ST_SetSRID(ST_MakePoint(lng::float8, lat::float8), 4326)
      WHERE geom IS NULL AND lat IS NOT NULL AND lng IS NOT NULL
    `)
  }

  return { fetched: items.length, matched: toInsert.length, inserted, ts: now.toISOString() }
}
