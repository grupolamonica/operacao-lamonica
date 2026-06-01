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

  // 3. Index O(1) por nome normalizado
  const byName = new Map(
    rankedDrivers.map((d) => [normalizeMotorista(d.nome), d])
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
