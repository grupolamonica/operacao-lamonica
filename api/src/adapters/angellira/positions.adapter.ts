/**
 * Positions adapter (D-12-30) — puxa posições ao vivo do Angellira (busca-geral)
 * e faz upsert em driver_positions. O nome do motorista vem do join
 * placa → vehicles → trip in_progress → driver no Torre DB (evita ~600 chamadas
 * detalhes-veiculo por execução; usa os dados já importados).
 *
 * geom PostGIS é gerenciado por SQL manual (Phase 10) — aqui gravamos lat/lng
 * numeric, suficiente para o mapa (maplibre lê lat/lng).
 */
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { driverPositions } from '../../db/schema/driver-positions'
import { getMapsToken, mapsUrl } from './auth'

function norm(s: string): string {
  return (s || '').toString().trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

interface BuscaGeralItem { placa?: string; lat?: number | string; lng?: number | string; pos?: string }

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

  // Mapa placa(normalizada) → motorista (viagem in_progress no Torre)
  const plateToDriver = new Map<string, string>()
  const rows = (await db.execute(sql`
    SELECT upper(replace(v.plate, '-', '')) AS plate_key, d.name AS driver_name
    FROM trips t
    JOIN vehicles v ON v.id = t.vehicle_id
    JOIN drivers  d ON d.id = t.driver_id
    WHERE t.status = 'in_progress'
  `)) as unknown as Array<{ plate_key: string; driver_name: string }>
  for (const r of rows) plateToDriver.set(r.plate_key, r.driver_name)

  const now = new Date()
  const toInsert: Array<typeof driverPositions.$inferInsert> = []
  for (const v of items) {
    const plateKey = (v.placa || '').toUpperCase().replace(/[-\s]/g, '')
    const motorista = plateToDriver.get(plateKey)
    if (!motorista) continue // só registra veículos em viagem ativa no Torre
    toInsert.push({
      motorista,
      motoristaNorm: norm(motorista),
      dataPosicao:   now,
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
  }

  return { fetched: items.length, matched: toInsert.length, inserted, ts: now.toISOString() }
}
