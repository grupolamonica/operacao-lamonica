/**
 * Serviço Cargas — compõe as respostas servidas em /api/cargas/* a partir das
 * leituras do Supabase de Cargas (D-14-01). Funções de orquestração: leem,
 * cruzam (cliente, candidatos, nome do motorista) e devolvem shapes prontos.
 *
 * Sem persistência nesta camada (proxy ao vivo, igual ranking) — a migration
 * de enrich em trips/drivers fica para a fatia de persistência (gated).
 */

import {
  fetchOpenLoadRows,
  fetchQueuedLeads,
  fetchClientes,
  fetchMotoristasByCpf,
} from './cargas.reads'
import { resolveClientName } from './cargas.clients'
import type { OpenLoad, LoadCandidate } from './cargas.types'

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
