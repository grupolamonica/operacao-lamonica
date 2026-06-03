/**
 * Detectores automáticos de ocorrência (D-12-28 / D-12-14) — porte do
 * verificarECriarTickets() do painel Lamonica, adaptado aos dados do Torre.
 *
 * v1 (computável com confiança a partir do Torre DB):
 *   - ATRASO          : in_progress e janela (window_end) já passou
 *   - PRAZO_PROXIMO   : window_end nas próximas 2h e ainda não chegou
 *   - SEM_GPS         : sem posição em driver_positions há > 1h
 *   - OK + auto-close : nenhum problema → fecha alerts automáticos abertos da viagem
 *
 * PARADA e PROXIMO_ENTREGA dependem de distância restante ao vivo (Angellira
 * distfaltante) — entram quando o positions.adapter enriquecer trips com km/eta.
 *
 * Idempotência: não duplica alert do mesmo tipo+trip em estado aberto/análise.
 * Auto-close preserva em_analise/em_tratativa (operador já cuidando).
 */
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { createAlert } from './alerts.service'

const AUTO_TYPES = ['atraso', 'prazo_proximo', 'sem_sinal', 'parada', 'proximo_entrega']
const OPEN_STATES = ['aberto', 'em_analise', 'em_tratativa']

export interface DetectorResult { scanned: number; created: number; closed: number; byType: Record<string, number> }

export async function runDetectors(): Promise<DetectorResult> {
  // Viagens ativas + última posição do motorista (idade em horas)
  const trips = (await db.execute(sql`
    SELECT
      t.id, t.code, t.driver_id, t.vehicle_id, t.window_end, t.status,
      EXTRACT(EPOCH FROM (now() - max(p.data_posicao))) / 3600.0 AS pos_age_h
    FROM trips t
    LEFT JOIN drivers d ON d.id = t.driver_id
    LEFT JOIN driver_positions p ON p.motorista_norm = upper(translate(trim(d.name),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))
    WHERE t.status = 'in_progress'
    GROUP BY t.id, t.code, t.driver_id, t.vehicle_id, t.window_end, t.status
  `)) as unknown as Array<{ id: string; code: string; driver_id: string | null; vehicle_id: string | null; window_end: string; status: string; pos_age_h: number | null }>

  // Alerts automáticos atualmente abertos, por trip+tipo
  const openRows = (await db.execute(sql`
    SELECT trip_id, type FROM alerts
    WHERE trip_id IS NOT NULL AND type = ANY(${sql.raw(`ARRAY[${AUTO_TYPES.map((t) => `'${t}'`).join(',')}]`)})
      AND status = ANY(${sql.raw(`ARRAY[${OPEN_STATES.map((s) => `'${s}'`).join(',')}]`)})
  `)) as unknown as Array<{ trip_id: string; type: string }>
  const openSet = new Set(openRows.map((r) => `${r.trip_id}:${r.type}`))

  const now = Date.now()
  const byType: Record<string, number> = {}
  let created = 0
  const okTripIds: string[] = []

  for (const t of trips) {
    const we = t.window_end ? new Date(t.window_end).getTime() : null
    const horasParaPrazo = we != null ? (we - now) / 3600000 : null
    const detected: Array<{ type: string; severity: 'critico' | 'medio' | 'baixo'; title: string }> = []

    if (we != null && horasParaPrazo! < 0) {
      detected.push({ type: 'atraso', severity: 'critico', title: `Viagem ${t.code} atrasada (janela vencida)` })
    } else if (horasParaPrazo != null && horasParaPrazo > 0 && horasParaPrazo <= 2) {
      detected.push({ type: 'prazo_proximo', severity: 'medio', title: `Viagem ${t.code}: prazo em ${horasParaPrazo.toFixed(1)}h` })
    }
    if (t.pos_age_h == null || t.pos_age_h > 1) {
      detected.push({ type: 'sem_sinal', severity: 'medio', title: `Viagem ${t.code} sem sinal GPS há ${t.pos_age_h == null ? '—' : t.pos_age_h.toFixed(1) + 'h'}` })
    }

    if (detected.length === 0) { okTripIds.push(t.id); continue }

    for (const d of detected) {
      if (openSet.has(`${t.id}:${d.type}`)) continue // idempotência
      await createAlert({ type: d.type, severity: d.severity, title: d.title, tripId: t.id, driverId: t.driver_id ?? undefined })
      created++; byType[d.type] = (byType[d.type] ?? 0) + 1
    }
  }

  // Auto-close: viagens OK → fecha alerts automáticos 'aberto' (preserva análise/tratativa)
  let closed = 0
  if (okTripIds.length) {
    const r = (await db.execute(sql`
      UPDATE alerts SET status = 'resolvido', resolved_at = now()
      WHERE trip_id = ANY(${sql.raw(`ARRAY[${okTripIds.map((id) => `'${id}'::uuid`).join(',')}]`)})
        AND status = 'aberto'
        AND type = ANY(${sql.raw(`ARRAY[${AUTO_TYPES.map((t) => `'${t}'`).join(',')}]`)})
      RETURNING id
    `)) as unknown as Array<{ id: string }>
    closed = r.length
  }

  return { scanned: trips.length, created, closed, byType }
}
