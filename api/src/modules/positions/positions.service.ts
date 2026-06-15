/**
 * positions.service.ts — Phase 11 (D-11-02, D-11-03)
 *
 * getFleetPositions(): retorna a última posição geocodada por motorista
 * (DISTINCT ON motorista_norm, geom IS NOT NULL) enriquecida com o ranking
 * via join cross-source server-side.
 *
 * Segurança:
 *   T-11-02: getRankingDrivers() roda server-side — anon/service key nunca sai.
 *   T-11-03: NÃO logar valores de linha (nomes + localização = PII).
 */

import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { getRankingDrivers } from '../ranking/ranking.service'
import { normalizeMotorista } from './viagens.parser'

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

/** Ponto do trajeto histórico (Phase 14 — rota do motorista no mapa). */
export interface TrackPoint {
  lat: number
  lng: number
  ts:  string
}

export interface FleetPosition {
  motorista:   string
  cidade:      string | null
  uf:          string | null
  dataPosicao: string           // ISO 8601
  veiculo:     string | null
  lat:         number
  lng:         number
  ranked:      boolean
  rank:        number | null
  pontuacao:   number | null
  status:      'ATIVO' | 'BLOQUEADO' | null
  vinculo:     string | null
}

// ---------------------------------------------------------------------------
// Raw row shape returned by postgres.js for this query
// ---------------------------------------------------------------------------

interface PositionRow {
  motorista:      string
  motorista_norm: string
  cidade:         string | null
  uf:             string | null
  data_posicao:   Date | string
  veiculo:        string | null
  lat:            string   // numeric → postgres.js retorna string
  lng:            string   // idem
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Retorna a última posição geocodada (geom IS NOT NULL) por motorista,
 * enriquecida com o ranking (getRankingDrivers, cache 60s).
 *
 * DISTINCT ON (motorista_norm) ORDER BY motorista_norm, data_posicao DESC
 * garante exatamente 1 linha por motorista — a mais recente.
 *
 * lat/lng numéricos coagidos de string (postgres.js/numeric).
 * getRankingDrivers chamado UMA vez e indexado em Map antes do loop.
 */
/**
 * Trajeto histórico de UM motorista (Phase 14, D-14-08) — pontos geocodados
 * ordenados por data_posicao ASC, para traçar a rota no mapa.
 * `motorista` pode vir com sufixo " (id)" do ranking — strip antes de normalizar.
 *
 * `from`/`to` (ISO, opcionais): restringem o trajeto à janela de UMA viagem.
 * Sem eles, driver_positions traz TODOS os pontos do motorista (várias viagens),
 * fazendo a polyline ligar trajetos distintos. A tela de Viagens passa a janela
 * da viagem selecionada (partida → chegada/agora) para isolar só aquela rota.
 */
export async function getDriverTrack(
  motorista: string,
  from?: string,
  to?: string,
): Promise<TrackPoint[]> {
  const norm = normalizeMotorista((motorista ?? '').replace(/\s*\(\d+\)\s*$/, ''))
  if (!norm) return []
  // Bounds só aplicadas quando parseáveis — entrada inválida não vira filtro silencioso.
  const fromTs = from ? new Date(from) : null
  const toTs   = to   ? new Date(to)   : null
  const fromOk = fromTs && !isNaN(fromTs.getTime())
  const toOk   = toTs   && !isNaN(toTs.getTime())
  const rows = await db.execute(sql`
    SELECT lat, lng, data_posicao
    FROM driver_positions
    WHERE motorista_norm = ${norm} AND lat IS NOT NULL AND lng IS NOT NULL
      ${fromOk ? sql`AND data_posicao >= ${fromTs!.toISOString()}` : sql``}
      ${toOk   ? sql`AND data_posicao <= ${toTs!.toISOString()}`   : sql``}
    ORDER BY data_posicao ASC
    LIMIT 1000
  `) as unknown as Array<{ lat: string; lng: string; data_posicao: Date | string }>
  return rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lng), ts: new Date(r.data_posicao).toISOString() }))
}

/** Última posição geocodada de UM motorista (para a visão 360 da viagem).
 *  Mesmo strip de sufixo " (id)" + normalização usados no resto do módulo. */
export async function getDriverLastPosition(
  motorista: string,
): Promise<{ lat: number; lng: number; cidade: string | null; uf: string | null; veiculo: string | null; at: string } | null> {
  const norm = normalizeMotorista((motorista ?? '').replace(/\s*\(\d+\)\s*$/, ''))
  if (!norm) return null
  const rows = (await db.execute(sql`
    SELECT lat, lng, cidade, uf, veiculo, data_posicao
    FROM driver_positions
    WHERE motorista_norm = ${norm} AND lat IS NOT NULL AND lng IS NOT NULL
    ORDER BY data_posicao DESC
    LIMIT 1
  `)) as unknown as Array<{ lat: string; lng: string; cidade: string | null; uf: string | null; veiculo: string | null; data_posicao: Date | string }>
  const r = rows[0]
  if (!r) return null
  return { lat: Number(r.lat), lng: Number(r.lng), cidade: r.cidade ?? null, uf: r.uf ?? null, veiculo: r.veiculo ?? null, at: new Date(r.data_posicao).toISOString() }
}

export async function getFleetPositions(): Promise<FleetPosition[]> {
  // 1. Query — última posição geocodada por motorista
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (motorista_norm)
      motorista,
      motorista_norm,
      cidade,
      uf,
      data_posicao,
      veiculo,
      lat,
      lng
    FROM driver_positions
    WHERE geom IS NOT NULL
    ORDER BY motorista_norm, data_posicao DESC
  `) as unknown as PositionRow[]

  // 2. Join cross-source — chamado UMA vez, fora do loop (cache 60s interno)
  const rankedDrivers = await getRankingDrivers()

  // 3. Index O(1) por nome normalizado.
  // O `nome` do ranking traz o ID do motorista no fim: "ADAUTO SANTOS COSTA (2729070)".
  // A planilha (driver_positions.motorista_norm) NÃO tem o ID → strip do sufixo " (\d+)"
  // antes de normalizar, senão o match nunca bate (confirmado no checkpoint live).
  const byName = new Map(
    rankedDrivers.map((d) => [normalizeMotorista(d.nome.replace(/\s*\(\d+\)\s*$/, '')), d])
  )

  // 4. Projeção + enriquecimento
  return rows.map((row) => {
    const driver = byName.get(row.motorista_norm)

    return {
      motorista:   row.motorista,
      cidade:      row.cidade,
      uf:          row.uf,
      dataPosicao: new Date(row.data_posicao).toISOString(),
      veiculo:     row.veiculo,
      lat:         Number(row.lat),
      lng:         Number(row.lng),
      ranked:      driver !== undefined,
      rank:        driver?.rank         ?? null,
      pontuacao:   driver?.pontuacao    ?? null,
      status:      driver?.status       ?? null,
      vinculo:     driver?.vinculo      ?? null,
    }
  })
}
