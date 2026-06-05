/**
 * Detectores automáticos de ocorrência (D-12-28 / D-12-14) — porte do
 * verificarECriarTickets() do painel Lamonica, adaptado aos dados do Torre.
 *
 * Roda de hora em hora (cron 0 * * * *) — mesma cadência do verificarECriarTickets do GAS.
 *   - ATRASO          : in_progress e janela (window_end) já passou
 *   - PRAZO_PROXIMO   : window_end nas próximas 2h e ainda longe (>100km ou km desconhecido)
 *   - PROXIMO_ENTREGA : km restante < 100 e no prazo/adiantada  (b — usa distance_total/done)
 *   - PARADA          : ≥2 posições em 45min, span ≥30min e sem deslocamento (b — usa driver_positions)
 *   - SEM_GPS         : sem posição em driver_positions há > 1h
 *   - OK + auto-close : nenhum problema → fecha alerts automáticos abertos da viagem
 *
 * PARADA/PROXIMO_ENTREGA disparam quando há km (distance_*) e/ou posições recentes;
 * sem esses dados ao vivo, ficam silenciosos (gating), sem falso-positivo.
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
  // Viagens ativas + última posição do motorista (idade em horas) + km restante
  // + agregados de posição recente (45min) para detectar PARADA (sem movimento).
  const trips = (await db.execute(sql`
    SELECT
      t.id, t.code, t.driver_id, t.vehicle_id, t.window_end, t.status,
      t.distance_total, t.distance_done,
      EXTRACT(EPOCH FROM (now() - max(p.data_posicao))) / 3600.0 AS pos_age_h,
      count(p.*) FILTER (WHERE p.data_posicao > now() - interval '45 minutes')                      AS pos_recent_n,
      EXTRACT(EPOCH FROM (
        max(p.data_posicao) FILTER (WHERE p.data_posicao > now() - interval '45 minutes')
        - min(p.data_posicao) FILTER (WHERE p.data_posicao > now() - interval '45 minutes')
      )) / 60.0                                                                                      AS pos_span_min,
      ( max(p.lat) FILTER (WHERE p.data_posicao > now() - interval '45 minutes')
        - min(p.lat) FILTER (WHERE p.data_posicao > now() - interval '45 minutes') )                AS lat_span,
      ( max(p.lng) FILTER (WHERE p.data_posicao > now() - interval '45 minutes')
        - min(p.lng) FILTER (WHERE p.data_posicao > now() - interval '45 minutes') )                AS lng_span
    FROM trips t
    LEFT JOIN drivers d ON d.id = t.driver_id
    LEFT JOIN driver_positions p ON p.motorista_norm = upper(translate(trim(d.name),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))
    WHERE t.status = 'in_progress'
    GROUP BY t.id, t.code, t.driver_id, t.vehicle_id, t.window_end, t.status, t.distance_total, t.distance_done
  `)) as unknown as Array<{
    id: string; code: string; driver_id: string | null; vehicle_id: string | null
    window_end: string; status: string
    distance_total: string | null; distance_done: string | null
    pos_age_h: number | null; pos_recent_n: number | null; pos_span_min: number | null
    lat_span: number | null; lng_span: number | null
  }>

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

  const KM_CHEGOU = 2 // km abaixo do qual considera-se chegada (igual ao painel GAS)
  for (const t of trips) {
    const we = t.window_end ? new Date(t.window_end).getTime() : null
    const horasParaPrazo = we != null ? (we - now) / 3600000 : null
    const distTotal = t.distance_total != null ? Number(t.distance_total) : null
    const distDone = t.distance_done != null ? Number(t.distance_done) : null
    const kmRest = (distTotal != null && distDone != null) ? Math.max(0, distTotal - distDone) : null
    const detected: Array<{ type: string; severity: 'critico' | 'medio' | 'baixo'; title: string }> = []

    // ATRASO / PRAZO_PROXIMO / PROXIMO_ENTREGA — mesma árvore de decisão do GAS
    if (we != null && horasParaPrazo! < 0) {
      detected.push({ type: 'atraso', severity: 'critico', title: `Viagem ${t.code} atrasada (janela vencida)` })
    } else if (kmRest != null && kmRest <= KM_CHEGOU) {
      // praticamente chegou — não gera prazo/proximo
    } else if (kmRest != null && kmRest < 100 && (horasParaPrazo == null || horasParaPrazo > 0)) {
      // PROXIMO_ENTREGA (b): perto do destino e no prazo/adiantada
      detected.push({ type: 'proximo_entrega', severity: 'baixo', title: `Viagem ${t.code} a ${kmRest.toFixed(0)} km do destino` })
    } else if (horasParaPrazo != null && horasParaPrazo > 0 && horasParaPrazo <= 2 && (kmRest == null || kmRest > 100)) {
      // PRAZO_PROXIMO: ≤2h e ainda longe (>100km) ou km desconhecido
      detected.push({ type: 'prazo_proximo', severity: 'medio', title: `Viagem ${t.code}: prazo em ${horasParaPrazo.toFixed(1)}h${kmRest != null ? ` e ${kmRest.toFixed(0)} km do destino` : ''}` })
    }

    // PARADA (b): ≥2 posições em 45min, span ≥30min e sem deslocamento (spread < ~2km)
    const lat = t.lat_span, lng = t.lng_span
    if ((t.pos_recent_n ?? 0) >= 2 && (t.pos_span_min ?? 0) >= 30 &&
        lat != null && lng != null && Math.abs(lat) < 0.02 && Math.abs(lng) < 0.02) {
      detected.push({ type: 'parada', severity: 'medio', title: `Viagem ${t.code} parada há ${Math.round(t.pos_span_min ?? 0)} min` })
    }

    // SEM_GPS
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
