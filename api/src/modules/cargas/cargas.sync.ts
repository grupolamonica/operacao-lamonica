/**
 * Sync do Cargas → Torre (Phase 14, persistência "salvar no sistema").
 *
 * Materializa o snapshot do Cargas no DB da Torre:
 *  1. cargas_open_loads   — replace com as cargas em aberto (52 no test)
 *  2. cargas_load_candidates — replace com os leads QUEUED dessas cargas
 *  3. trips.cargas_status / cargas_load_id — enriquece por join de LH
 *
 * Cache (replace a cada run), não fonte de verdade. Idempotente.
 * Enrich de drivers (ranking_*, candidaturas) fica para a Onda D (Motoristas).
 */

import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { cargasOpenLoads, cargasLoadCandidates } from '../../db/schema/cargas'
import { getOpenLoads } from './cargas.service'
import { fetchQueuedLeads, fetchMotoristasByCpf, fetchCargasLhStatus } from './cargas.reads'

export interface SyncResult {
  openLoads: number
  candidates: number
  tripsEnriched: number
  ts: string
}

const numOrNull = (n: number | null): string | null => (n === null ? null : String(n))

export async function syncCargas(): Promise<SyncResult> {
  // 1. Cargas em aberto → cache (replace)
  const openLoads = await getOpenLoads()
  await db.delete(cargasOpenLoads)
  if (openLoads.length > 0) {
    await db.insert(cargasOpenLoads).values(
      openLoads.map((l) => ({
        id: l.id,
        lh: l.lh,
        cliente: l.cliente,
        origem: l.origem,
        destino: l.destino,
        perfil: l.perfil,
        valor: numOrNull(l.valor),
        bonus: numOrNull(l.bonus),
        status: l.status,
        distanciaKm: null,
        candidatesCount: l.candidatesCount,
      })),
    )
  }

  // 2. Candidatos (leads QUEUED dos open loads) → cache (replace), com nome cruzado
  const leads = await fetchQueuedLeads(openLoads.map((l) => l.id))
  const cpfs = leads.map((l) => l.cpf).filter((c): c is string => !!c)
  const motoristas = await fetchMotoristasByCpf(cpfs)
  const nomeByCpf = new Map(motoristas.map((m) => [m.cpf, m.nome]))
  await db.delete(cargasLoadCandidates)
  if (leads.length > 0) {
    await db.insert(cargasLoadCandidates).values(
      leads.map((l) => ({
        id: l.id,
        loadId: l.load_id,
        origin: 'lead',
        driverCpf: l.cpf,
        driverNome: l.cpf ? nomeByCpf.get(l.cpf) ?? null : null,
        horsePlate: l.horse_plate,
        trailerPlate: l.trailer_plate,
        vehicleType: l.vehicle_type,
        queuePosition: null,
        status: l.status,
      })),
    )
  }

  // 3. Enrich trips.cargas_status / cargas_load_id por LH (bulk UPDATE FROM VALUES)
  const lhRows = await fetchCargasLhStatus()
  let tripsEnriched = 0
  const CHUNK = 500
  for (let i = 0; i < lhRows.length; i += CHUNK) {
    const chunk = lhRows.slice(i, i + CHUNK)
    if (chunk.length === 0) continue
    const values = sql.join(
      chunk.map((r) => sql`(${r.lh}::text, ${r.status}::text, ${r.id}::uuid)`),
      sql`, `,
    )
    const res = await db.execute(
      sql`UPDATE trips t SET cargas_status = v.status, cargas_load_id = v.id
          FROM (VALUES ${values}) AS v(lh, status, id)
          WHERE t.sheet_lh = v.lh`,
    )
    tripsEnriched += (res as unknown as { count?: number }).count ?? 0
  }

  return {
    openLoads: openLoads.length,
    candidates: leads.length,
    tripsEnriched,
    ts: new Date().toISOString(),
  }
}
