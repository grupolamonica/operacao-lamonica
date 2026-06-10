/**
 * Serviço Cargas — compõe as respostas servidas em /api/cargas/* a partir das
 * leituras do Supabase de Cargas (D-14-01). Funções de orquestração: leem,
 * cruzam (cliente, candidatos, nome do motorista) e devolvem shapes prontos.
 *
 * Sem persistência nesta camada (proxy ao vivo, igual ranking) — a migration
 * de enrich em trips/drivers fica para a fatia de persistência (gated).
 */

import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { redis } from '../../redis/client'
import { logger } from '../../lib/logger'
import { parseCsv, colFinder } from '../../adapters/painel-sheet/painel-sync'
import { normalizeMotorista } from '../positions/viagens.parser'
import {
  fetchOpenLoadRows,
  fetchQueuedLeads,
  fetchClientes,
  fetchMotoristasByCpf,
} from './cargas.reads'
import { resolveClientName } from './cargas.clients'
import type { OpenLoad, LoadCandidate, AvailableDriver } from './cargas.types'

function toNum(v: number | string | null): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Lista de cargas em aberto + contagem de candidatos por carga. */
export async function getOpenLoads(): Promise<OpenLoad[]> {
  const [rows, clientes] = await Promise.all([fetchOpenLoadRows(), fetchClientes()])
  const clientesById = new Map(clientes.map((c) => [c.id, c.nome]))

  // Contagem de candidatos (QUEUED) por load, em uma query só.
  const loadIds = rows.map((r) => r.id)
  const leads = await fetchQueuedLeads(loadIds)
  const candCount = new Map<string, number>()
  for (const l of leads) candCount.set(l.load_id, (candCount.get(l.load_id) ?? 0) + 1)

  return rows.map((r) => {
    const valor = toNum(r.valor)
    const bonus = toNum(r.bonus)
    const compensacao = valor !== null || bonus !== null ? (valor ?? 0) + (bonus ?? 0) : null
    return {
      id: r.id,
      lh: r.sheet_lh,
      cliente: resolveClientName(r.cliente_id, clientesById),
      origem: r.origem,
      destino: r.destino,
      perfil: r.perfil,
      valor,
      bonus,
      compensacao,
      status: r.status,
      candidatesCount: candCount.get(r.id) ?? 0,
    }
  })
}

// --- Motoristas disponíveis (BUILD C — alocação sem digitar CPF/telefone) ---

// Pares from/to do translate() p/ strip de acentos no Postgres (mesmo padrão de drivers.service.ts).
const ACC = "'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç','AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'"

// Aliases → perfil canônico do Cargas (espelha vehicle-profiles.js do Cargas_Lamonica).
const VEHICLE_PROFILE_ALIASES = new Map([
  ['TRUCK', 'TRUCK'], ['TOCO', 'TRUCK'], ['3/4', 'TRUCK'],
  ['CARRETA', 'CARRETA'],
  ['CARRETA_EXPRESSA', 'CARRETA_EXPRESSA'], ['CARRETA EXPRESSA', 'CARRETA_EXPRESSA'], ['CARRETA - EXPRESSA', 'CARRETA_EXPRESSA'],
  ['BITREM', 'BITREM'], ['BITRUCK', 'BITREM'],
])

function inferVehicleType(veiculo: string | null | undefined): string | null {
  const key = String(veiculo ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (!key) return null
  return VEHICLE_PROFILE_ALIASES.get(key) ?? null
}

const AVAILABLE_CACHE_KEY = 'cargas:available-drivers'
const AVAILABLE_CACHE_TTL = 60 // segundos

/**
 * Motoristas disponíveis para alocação avulsa:
 *  - fonte: tabela drivers da Torre (só quem tem CPF de 11 dígitos);
 *  - disponível = SEM trip in_progress (match driver_id + nome normalizado, padrão getDriverStats);
 *  - veículos: último sheet_cavalo/sheet_carreta de trips, sobrescritos pela aba
 *    DISPONIBILIDADE da planilha do painel (curada à mão) quando o nome casa;
 *  - EXCLUI quem está na aba Bloqueados da mesma planilha.
 */
export async function getAvailableDrivers(): Promise<AvailableDriver[]> {
  try {
    const cached = await redis.get(AVAILABLE_CACHE_KEY)
    if (cached) return JSON.parse(cached) as AvailableDriver[]
  } catch { /* cache best-effort */ }

  // UNION de equi-joins (driver_id + nome norm) — OR-join único vira nested loop (ver drivers.service.ts).
  const rows = (await db.execute(sql`
    WITH dn AS (
      SELECT id, name, cpf, phone, driver_kind,
             upper(translate(trim(name), ${sql.raw(ACC)})) AS nm
      FROM drivers
      WHERE cpf IS NOT NULL AND length(regexp_replace(cpf, '\\D', '', 'g')) = 11
    ), tn AS (
      SELECT id, driver_id, status, sheet_cavalo, sheet_carreta, updated_at,
             nullif(upper(translate(trim(sheet_motorista), ${sql.raw(ACC)})), '') AS nm
      FROM trips
    ), m AS (
      SELECT tn.id AS trip_id, dn.id AS did, tn.status, tn.sheet_cavalo, tn.sheet_carreta, tn.updated_at
      FROM tn JOIN dn ON dn.id = tn.driver_id
      UNION
      SELECT tn.id, dn.id, tn.status, tn.sheet_cavalo, tn.sheet_carreta, tn.updated_at
      FROM tn JOIN dn ON tn.nm IS NOT NULL AND tn.nm = dn.nm
    ), busy AS (
      SELECT DISTINCT did FROM m WHERE status = 'in_progress'
    ), lv AS (
      SELECT DISTINCT ON (did) did, sheet_cavalo, sheet_carreta
      FROM m
      WHERE sheet_cavalo IS NOT NULL OR sheet_carreta IS NOT NULL
      ORDER BY did, updated_at DESC
    )
    SELECT dn.name, dn.cpf, dn.phone, dn.driver_kind,
           lv.sheet_cavalo, lv.sheet_carreta
    FROM dn
    LEFT JOIN lv ON lv.did = dn.id
    WHERE dn.id NOT IN (SELECT did FROM busy)
    ORDER BY dn.name
  `)) as unknown as Array<{
    name: string; cpf: string; phone: string | null; driver_kind: string | null
    sheet_cavalo: string | null; sheet_carreta: string | null
  }>

  // Abas do workbook OPERACIONAL (DISPONIBILIDADE/Bloqueados vivem em outra planilha
  // Google — Lamonica-Shopee —, não na do painel). gviz com aba inexistente cai
  // silenciosamente na primeira aba (Carrega): detectamos a assinatura e tratamos
  // como ausente. Para ativar ao vivo, definir PAINEL_OPS_SHEET_ID com o id dela.
  const isGvizFallback = (rows: string[][]) =>
    rows.some((r, i) => i < 2 && r.some((c) => String(c ?? '').includes('Cód. Viagem')))
  const opsSheet = async (name: string): Promise<string[][]> => {
    const opsId = process.env.PAINEL_OPS_SHEET_ID
    if (!opsId) return []
    try {
      const url = `https://docs.google.com/spreadsheets/d/${opsId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!res.ok) throw new Error(`ops sheet ${name}: ${res.status}`)
      const rows = parseCsv(await res.text())
      return isGvizFallback(rows) ? [] : rows
    } catch (e) {
      logger.warn({ err: String(e) }, `[cargas] aba ${name} indisponível`)
      return []
    }
  }
  const [disp, bloq] = await Promise.all([
    opsSheet('DISPONIBILIDADE ').then((r) => (r.length ? r : opsSheet('DISPONIBILIDADE'))),
    opsSheet('Bloqueados'),
  ])

  // DISPONIBILIDADE: Condutor → { cavalo, carreta, veiculo, vinculo } (curada à mão = vence o trips).
  // O header real não é a linha 0 (linha 0 = banner 'CARROS EXTRAS') — procura a linha com 'Condutor'.
  const sheetByName = new Map<string, { cavalo: string; carreta: string; veiculo: string; vinculo: string }>()
  {
    const hIdx = disp.slice(0, 5).findIndex((r) => r.some((cell) => String(cell ?? '').trim().toLowerCase() === 'condutor'))
    if (hIdx >= 0) {
      const c = colFinder(disp[hIdx])
      const iCond = c('Condutor'), iCav = c('CAVALO'), iCar = c('CARRETA I', 'CARRETA'), iVei = c('VEICULO', 'Veículo'), iVin = c('Vinculo', 'Vínculo')
      for (const r of disp.slice(hIdx + 1)) {
        const nome = String(r[iCond] ?? '').trim(); if (!nome) continue
        sheetByName.set(normalizeMotorista(nome), {
          cavalo: iCav >= 0 ? String(r[iCav] ?? '').trim() : '',
          carreta: iCar >= 0 ? String(r[iCar] ?? '').trim() : '',
          veiculo: iVei >= 0 ? String(r[iVei] ?? '').trim() : '',
          vinculo: iVin >= 0 ? String(r[iVin] ?? '').trim() : '',
        })
      }
    }
  }

  // Bloqueados: nomes normalizados a EXCLUIR.
  const blocked = new Set<string>()
  {
    const h = bloq[0] ?? []; const c = colFinder(h)
    let iMot = c('Motorista'); if (iMot < 0 && bloq.length > 0) iMot = 0
    for (const r of bloq.slice(1)) {
      const nome = String(r[iMot] ?? '').trim()
      if (nome) blocked.add(normalizeMotorista(nome))
    }
  }

  const out: AvailableDriver[] = []
  for (const r of rows) {
    const nm = normalizeMotorista(r.name)
    if (blocked.has(nm)) continue
    const sheet = sheetByName.get(nm)
    out.push({
      name: r.name,
      cpf: r.cpf,
      phone: r.phone ?? null,
      vinculo: r.driver_kind ?? (sheet?.vinculo || null),
      horsePlate: (sheet?.cavalo || r.sheet_cavalo) ?? null,
      trailerPlate: (sheet?.carreta || r.sheet_carreta) ?? null,
      vehicleType: inferVehicleType(sheet?.veiculo),
      disponivel: true,
      fonte: sheet ? 'planilha' : 'torre',
    })
  }

  try { await redis.set(AVAILABLE_CACHE_KEY, JSON.stringify(out), 'EX', AVAILABLE_CACHE_TTL) } catch { /* noop */ }
  return out
}

/** Candidatos de uma carga (QUEUED leads), com nome cruzado por CPF. */
export async function getLoadCandidates(loadId: string): Promise<LoadCandidate[]> {
  const leads = await fetchQueuedLeads([loadId])
  const cpfs = leads.map((l) => l.cpf).filter((c): c is string => !!c)
  const motoristas = await fetchMotoristasByCpf(cpfs)
  const nomeByCpf = new Map(motoristas.map((m) => [m.cpf, m.nome]))

  return leads.map((l) => ({
    id: l.id,
    origin: 'lead' as const,
    cpf: l.cpf,
    nome: l.cpf ? nomeByCpf.get(l.cpf) ?? null : null,
    horsePlate: l.horse_plate,
    trailerPlate: l.trailer_plate,
    vehicleType: l.vehicle_type,
    status: l.status,
  }))
}
