/**
 * Sync do Cargas → Torre (Phase 14, persistência "salvar no sistema").
 *
 * Materializa o snapshot do Cargas no DB da Torre:
 *  1. cargas_open_loads   — replace com as cargas em aberto (52 no test)
 *  2. cargas_load_candidates — replace com os leads QUEUED dessas cargas
 *  3. trips.cargas_status / cargas_load_id — enriquece por join de LH
 *  4. drivers.ranking_* / cargas_candidaturas_abertas — enrich por nome
 *     normalizado (ranking) e CPF (candidatos QUEUED), Onda D (Motoristas)
 *
 * Cache (replace a cada run), não fonte de verdade. Idempotente.
 */

import { sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db } from '../../db/client'
import { cargasOpenLoads, cargasLoadCandidates } from '../../db/schema/cargas'
import { getRankingDrivers } from '../ranking/ranking.service'
import { normalizeMotorista } from '../positions/viagens.parser'
import { getOpenLoads } from './cargas.service'
import { fetchQueuedLeads, fetchMotoristasByCpf, fetchCargasLhStatus, fetchAllCargasForTrips, type CargaTripRow } from './cargas.reads'

export interface SyncResult {
  openLoads: number
  candidates: number
  cargasTrips: number
  tripsEnriched: number
  driversRanked: number
  driversCandidaturas: number
  ts: string
}

const numOrNull = (n: number | null): string | null => (n === null ? null : String(n))

/** UUID v5 determinístico (mesmo NS do painel-sync) — id estável por chave. */
function uuid5(name: string): string {
  const NS = '6ba7b8109dad11d180b400c04fd430c8'
  const h = createHash('sha1').update(Buffer.from(NS, 'hex')).update(name).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

const numStr = (v: number | string | null): string | null => (v == null || v === '' ? null : String(v))

/** Mapeia status do Cargas → status de trip da Torre. */
function tripStatusFromCarga(c: CargaTripRow): string {
  const ss = (c.sheet_status ?? '').toUpperCase()
  if (ss.includes('DESCARREGAD') || c.status === 'COMPLETED') return 'completed'
  if (ss.includes('CANCEL') || c.status === 'CANCELLED' || c.status === 'FAILED') return 'cancelled'
  if (['OPEN', 'RESERVED', 'DRAFT', 'EXPIRED'].includes(c.status)) return 'planned'
  return 'in_progress'
}

/**
 * Onda A (D-14) — Cargas como FONTE de viagens: upsert cargas → trips por LH.
 * Não duplica os trips que já estão AO VIVO no painel (mesmo LH); o painel é a
 * verdade ao vivo (posição/ETA), o Cargas preenche o resto (booked/histórico/abertas).
 * Dedup por LH (evita colisão no code único). FK client_id só quando existe na Torre.
 */
export async function upsertCargasAsTrips(): Promise<number> {
  const cargas = await fetchAllCargasForTrips()

  const painelLh = new Set<string>(
    ((await db.execute(sql`SELECT DISTINCT sheet_lh FROM trips WHERE source='painel' AND sheet_lh IS NOT NULL`)) as unknown as Array<{ sheet_lh: string }>)
      .map((r) => r.sheet_lh.toUpperCase()),
  )
  const torreClients = new Set<string>(
    ((await db.execute(sql`SELECT id FROM clients`)) as unknown as Array<{ id: string }>).map((r) => r.id),
  )

  // dedup por LH (code é único) + pula LH já vivo no painel
  const byLh = new Map<string, CargaTripRow>()
  for (const c of cargas) {
    const lh = (c.sheet_lh ?? '').toUpperCase()
    if (!lh || painelLh.has(lh) || byLh.has(lh)) continue
    byLh.set(lh, c)
  }
  const list = [...byLh.entries()]
  if (list.length === 0) return 0

  let upserted = 0
  const B = 500
  for (let i = 0; i < list.length; i += B) {
    const batch = list.slice(i, i + B)
    const cut = (s: string | null, n: number): string | null => { const v = (s ?? '').trim(); return v ? v.slice(0, n) : null }
    const vals = batch.map(([lh, c]) => {
      const id = uuid5('cargas|' + c.id)
      const ws = c.data ? new Date(c.data).toISOString() : new Date().toISOString()
      const clientId = c.cliente_id && torreClients.has(c.cliente_id) ? c.cliente_id : null
      return sql`(${id}, ${('CRG-' + lh).slice(0, 20)}, 'cargas', 'media', ${clientId}, ${cut(c.origem, 200)}, ${cut(c.destino, 200)},
        ${ws}, ${ws}, ${tripStatusFromCarga(c)}, ${cut(lh, 50)}, ${cut(lh, 50)}, ${cut(c.sheet_status, 40)}, ${c.id},
        ${numStr(c.valor)}, ${numStr(c.bonus)}, ${c.sheet_motorista}, ${cut(c.sheet_cavalo, 12)}, ${cut(c.sheet_carreta, 12)}, now(), now())`
    })
    await db.execute(sql`
      INSERT INTO trips (id, code, source, priority, client_id, origin, destination,
        window_start, window_end, status, sheet_lh, linked_lh, cargas_status, cargas_load_id,
        valor, bonus, sheet_motorista, sheet_cavalo, sheet_carreta, created_at, updated_at)
      VALUES ${sql.join(vals, sql`, `)}
      ON CONFLICT (id) DO UPDATE SET
        status=EXCLUDED.status, client_id=EXCLUDED.client_id, origin=EXCLUDED.origin, destination=EXCLUDED.destination,
        cargas_status=EXCLUDED.cargas_status, cargas_load_id=EXCLUDED.cargas_load_id, linked_lh=EXCLUDED.linked_lh,
        valor=EXCLUDED.valor, bonus=EXCLUDED.bonus, sheet_motorista=EXCLUDED.sheet_motorista,
        sheet_cavalo=EXCLUDED.sheet_cavalo, sheet_carreta=EXCLUDED.sheet_carreta, updated_at=now()
    `)
    upserted += batch.length
  }
  return upserted
}

/**
 * Onda D (Motoristas) — persiste o cruzamento no drivers da Torre:
 *  - ranking_pontuacao / ranking_posicao por nome normalizado (mesmo join
 *    read-time de drivers.service: strip do sufixo " (id)" + normalizeMotorista)
 *  - cargas_candidaturas_abertas = count de candidatos QUEUED por CPF (dígitos),
 *    zerando quem não tem (senão fica stale)
 */
export async function enrichDrivers(): Promise<{ driversRanked: number; driversCandidaturas: number }> {
  // 1. Ranking → drivers por nome normalizado (bulk UPDATE FROM VALUES).
  let driversRanked = 0
  try {
    const ranked = await getRankingDrivers()
    const rankByName = new Map<string, { pontuacao: number | null; rank: number | null }>()
    for (const r of ranked) {
      rankByName.set(normalizeMotorista(r.nome.replace(/\s*\(\d+\)\s*$/, '')), {
        pontuacao: r.pontuacao ?? null, rank: r.rank ?? null,
      })
    }
    const torreDrivers = (await db.execute(sql`SELECT id, name FROM drivers`)) as unknown as Array<{ id: string; name: string }>
    const matched = torreDrivers.flatMap((d) => {
      const rk = rankByName.get(normalizeMotorista(d.name))
      return rk ? [{ id: d.id, rk }] : []
    })
    const B = 500
    for (let i = 0; i < matched.length; i += B) {
      const chunk = matched.slice(i, i + B)
      const values = sql.join(
        chunk.map((m) => sql`(${m.id}::uuid, ${m.rk.pontuacao == null ? null : String(m.rk.pontuacao)}::numeric, ${m.rk.rank}::int)`),
        sql`, `,
      )
      const res = await db.execute(
        sql`UPDATE drivers d SET ranking_pontuacao = v.pontuacao, ranking_posicao = v.posicao, updated_at = now()
            FROM (VALUES ${values}) AS v(id, pontuacao, posicao)
            WHERE d.id = v.id`,
      )
      driversRanked += (res as unknown as { count?: number }).count ?? 0
    }
  } catch (err) {
    // Ranking indisponível ou falha no persist — segue sem persistir rank, mas loga (não mascarar bug de SQL).
    console.warn('[cargas.sync] enrichDrivers: persist de ranking falhou', err)
  }

  // 2. Candidaturas QUEUED por CPF (só dígitos) — zera todo mundo e regrava quem tem.
  await db.execute(sql`UPDATE drivers SET cargas_candidaturas_abertas = 0 WHERE cargas_candidaturas_abertas <> 0`)
  const res = await db.execute(sql`
    UPDATE drivers d SET cargas_candidaturas_abertas = c.n, updated_at = now()
    FROM (
      SELECT regexp_replace(driver_cpf, '[^0-9]', '', 'g') AS cpf, count(*)::int AS n
      FROM cargas_load_candidates
      WHERE status = 'QUEUED' AND driver_cpf IS NOT NULL
      GROUP BY 1
    ) c
    WHERE d.cpf IS NOT NULL AND c.cpf <> '' AND regexp_replace(d.cpf, '[^0-9]', '', 'g') = c.cpf
  `)
  const driversCandidaturas = (res as unknown as { count?: number }).count ?? 0

  return { driversRanked, driversCandidaturas }
}

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

  // 3. Cargas como FONTE de viagens (Onda A) — upsert cargas → trips por LH (não duplica painel).
  const cargasTrips = await upsertCargasAsTrips()

  // 4. Enrich trips.cargas_status / cargas_load_id por LH (bulk UPDATE FROM VALUES) — pega os trips do painel.
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

  // 5. Enrich de drivers (Onda D) — persiste ranking_* + candidaturas abertas.
  const { driversRanked, driversCandidaturas } = await enrichDrivers()

  return {
    openLoads: openLoads.length,
    candidates: leads.length,
    cargasTrips,
    tripsEnriched,
    driversRanked,
    driversCandidaturas,
    ts: new Date().toISOString(),
  }
}
