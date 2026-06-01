/**
 * driverInsights — pure helpers for the DriverDetailsDialog (full ride-rank parity).
 *
 * Ported/consolidated from ride-rank: lib/driverDetails.ts (buildDriverAnalysis,
 * summarizeDriverRoutes, sortTripsByLatest, stripDriverIdSuffix, formatDriverRank),
 * lib/qualityInsights.ts (getSingleDriverEvaluationSummary), lib/tripTiming.ts
 * (formatTripDelta), lib/tripFilters.ts (getDriverVinculoLabel, getRouteLabel,
 * getRouteKey) and services/routeScoreService.ts (getRouteBasePoints).
 *
 * All functions are PURE (no I/O, no React) and operate over the Torre Phase-7/9
 * contract types (Trip, RankedDriver, RouteScoreRecord, EvaluationRecord).
 */

import type { Trip, RankedDriver, RouteScoreRecord, EvaluationRecord } from '@/hooks/useRanking'

// ---------------------------------------------------------------------------
// Date parsing (driver trips arrive BR "dd/MM/yyyy HH:mm:ss"; route_scores ISO)
// ---------------------------------------------------------------------------

export function parseTripDate(dateStr?: string | null): Date | null {
  if (!dateStr || dateStr === '-') return null
  const [datePart, timePart = '00:00:00'] = dateStr.split(' ')
  const [day, month, year] = datePart.split('/')
  if (day && month && year) {
    const d = new Date(`${year}-${month}-${day}T${timePart}`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(dateStr)
  return Number.isNaN(d.getTime()) ? null : d
}

// ---------------------------------------------------------------------------
// Name / rank formatting
// ---------------------------------------------------------------------------

/** Strip the " (id)" suffix that deriveDrivers appends to driver.nome. */
export function stripDriverIdSuffix(driverName: string, driverId: string): string {
  const escaped = driverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return driverName.replace(new RegExp(`\\s*\\(${escaped}\\)$`), '')
}

/** "#1 de 15" / "Sem rank" — mirrors ride-rank formatDriverRank. */
export function formatDriverRank(position?: number | null, total?: number | null): string {
  if (!position || !total || position < 1 || total < 1) return 'Sem rank'
  return `#${position} de ${total}`
}

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

function normalizeRouteCode(code?: string | null): string {
  const t = (code || '').trim()
  return t || '-'
}

export function getRouteKey(origin?: string | null, destination?: string | null): string {
  return `${normalizeRouteCode(origin)}__${normalizeRouteCode(destination)}`
}

export function getRouteLabel(origin?: string | null, destination?: string | null): string {
  return `${normalizeRouteCode(origin)} → ${normalizeRouteCode(destination)}`
}

/**
 * Base points for a route at a given date, from route_scores. Returns 1 when no
 * matching route. Picks the score whose [data_inicio, data_fim] window contains
 * the trip date; falls back to the most recent matching score. Ported from
 * ride-rank routeScoreService.getRouteBasePoints.
 */
export function getRouteBasePoints(
  routeScores: RouteScoreRecord[],
  originCode: string,
  destinationCode: string,
  tripDate?: string,
): number {
  const matching = routeScores.filter(
    (r) => r.origin_code === originCode && r.destination_code === destinationCode,
  )
  if (matching.length === 0) return 1

  const refDate = tripDate ? parseTripDate(tripDate) ?? new Date(tripDate) : new Date()
  for (const m of matching) {
    const start = new Date(m.data_inicio as unknown as string)
    const end = m.data_fim ? new Date(m.data_fim as unknown as string) : null
    if (refDate >= start && (!end || refDate <= end)) return m.pontuacao
  }
  return matching[0]?.pontuacao ?? 1
}

// ---------------------------------------------------------------------------
// Trip sorting + per-route summary
// ---------------------------------------------------------------------------

export function sortTripsByLatest(trips: Trip[]): Trip[] {
  return [...trips].sort((a, b) => {
    const da = parseTripDate(a.data)?.getTime() ?? 0
    const db = parseTripDate(b.data)?.getTime() ?? 0
    if (db !== da) return db - da
    return a.id.localeCompare(b.id)
  })
}

export interface DriverRouteSummary {
  key: string
  label: string
  tripCount: number
  totalScore: number
  averageScore: number
  occurrenceCount: number
  evaluatedCount: number
  lastTripDate: string
}

export function summarizeDriverRoutes(trips: Trip[]): DriverRouteSummary[] {
  const map = new Map<string, DriverRouteSummary>()
  for (const t of trips) {
    const key = getRouteKey(t.origin_code, t.destination_code)
    let s = map.get(key)
    if (!s) {
      s = {
        key,
        label: getRouteLabel(t.origin_code, t.destination_code),
        tripCount: 0,
        totalScore: 0,
        averageScore: 0,
        occurrenceCount: 0,
        evaluatedCount: 0,
        lastTripDate: '',
      }
      map.set(key, s)
    }
    s.tripCount += 1
    s.totalScore += t.score_final
    s.occurrenceCount += t.ocorrencia_count
    if (t.evaluated) s.evaluatedCount += 1
    const cur = parseTripDate(t.data)?.getTime() ?? 0
    const prev = parseTripDate(s.lastTripDate)?.getTime() ?? 0
    if (!s.lastTripDate || cur > prev) s.lastTripDate = t.data
  }
  const arr = [...map.values()]
  for (const s of arr) {
    s.averageScore = s.tripCount ? Math.round((s.totalScore / s.tripCount) * 10) / 10 : 0
  }
  return arr.sort((a, b) => b.totalScore - a.totalScore || a.label.localeCompare(b.label))
}

// ---------------------------------------------------------------------------
// Evaluation summary (quality insights)
// ---------------------------------------------------------------------------

export interface DriverEvaluationSummary {
  driverId: string
  driverName: string
  tripCount: number
  evaluationCount: number
  noShowCount: number
  communicationLevel: 'Boa' | 'Regular' | 'Ruim' | 'Sem avaliação'
  behaviorLevel: 'Adequado' | 'Atenção' | 'Crítico' | 'Sem avaliação'
  communicationBreakdown: { boa: number; regular: number; ruim: number }
  behaviorBreakdown: { ok: number; ruim: number }
}

function getCommunicationLevel(b: { boa: number; regular: number; ruim: number }) {
  const total = b.boa + b.regular + b.ruim
  if (total === 0) return 'Sem avaliação' as const
  const avg = (b.boa * 2 + b.regular) / total
  return avg >= 1.5 ? ('Boa' as const) : avg >= 0.75 ? ('Regular' as const) : ('Ruim' as const)
}

function getBehaviorLevel(b: { ok: number; ruim: number }) {
  const total = b.ok + b.ruim
  if (total === 0) return 'Sem avaliação' as const
  const avg = b.ok / total
  return avg >= 0.8 ? ('Adequado' as const) : avg >= 0.5 ? ('Atenção' as const) : ('Crítico' as const)
}

const stripDots = (s: string): string => (s || '').replace(/\./g, '')

/**
 * Summarize a single driver's evaluations. Matches by driver_id (dot-stripped)
 * or by trip membership. Mirrors ride-rank getSingleDriverEvaluationSummary.
 */
export function getSingleDriverEvaluationSummary(
  driverId: string,
  driverName: string,
  trips: Trip[],
  evaluations: EvaluationRecord[],
): DriverEvaluationSummary {
  const tripIds = new Set(trips.map((t) => t.id))
  const normId = stripDots(driverId)
  const driverEvals = evaluations.filter(
    (e) => stripDots(e.driver_id) === normId || tripIds.has(e.trip_id),
  )

  const communicationBreakdown = { boa: 0, regular: 0, ruim: 0 }
  const behaviorBreakdown = { ok: 0, ruim: 0 }
  let noShowCount = 0

  for (const e of driverEvals) {
    const c = (e.comunicacao || '').toUpperCase()
    if (c === 'BOA') communicationBreakdown.boa += 1
    else if (c === 'REGULAR') communicationBreakdown.regular += 1
    else if (c === 'RUIM') communicationBreakdown.ruim += 1

    const p = (e.postura || '').toUpperCase()
    if (p === 'OK') behaviorBreakdown.ok += 1
    else if (p === 'RUIM') behaviorBreakdown.ruim += 1

    if (e.atendeu === false) noShowCount += 1
  }

  return {
    driverId,
    driverName,
    tripCount: trips.length,
    evaluationCount: driverEvals.length,
    noShowCount,
    communicationLevel: getCommunicationLevel(communicationBreakdown),
    behaviorLevel: getBehaviorLevel(behaviorBreakdown),
    communicationBreakdown,
    behaviorBreakdown,
  }
}

// ---------------------------------------------------------------------------
// Trip delta + vinculo label
// ---------------------------------------------------------------------------

export function formatTripDelta(deltaMinutes?: number | null): string {
  if (deltaMinutes == null) return 'Sem comparativo com o previsto'
  if (deltaMinutes === 0) return 'No horário previsto'
  const abs = Math.abs(deltaMinutes)
  return deltaMinutes > 0
    ? `Atrasou ${abs} min em relação ao previsto`
    : `Adiantou ${abs} min em relação ao previsto`
}

/** Display label for a driver vinculo; empty/dash variants → "Terceiros". */
export function getDriverVinculoLabel(vinculo?: string | null): string {
  const v = (vinculo || '').trim()
  if (!v || v === '-' || v === '—' || v === 'â€”') return 'Terceiros'
  return v
}

// ---------------------------------------------------------------------------
// Driver analysis ("Análise da Lamônica")
// ---------------------------------------------------------------------------

export type AnalysisTone = 'success' | 'warning' | 'danger'

export interface AnalysisHighlight {
  label: string
  value: string
  helper: string
  tone: 'success' | 'warning' | 'danger' | 'neutral'
}

export interface DriverAnalysis {
  title: string
  tone: AnalysisTone
  statusLabel: string
  summary: string
  recommendation: string
  highlights: AnalysisHighlight[]
}

export interface DriverRankingSnapshot {
  position: number | null
  total: number
}

/**
 * Operational reading of a driver for the filtered route — verdict (tone),
 * narrative summary, scale recommendation and metric highlights. Faithful
 * reimplementation of ride-rank buildDriverAnalysis (same thresholds).
 */
export function buildDriverAnalysis(
  driver: RankedDriver,
  trips: Trip[],
  evaluationSummary: DriverEvaluationSummary,
  ranking?: DriverRankingSnapshot | null,
): DriverAnalysis {
  if (trips.length === 0) {
    return {
      title: 'Sem viagens no recorte',
      tone: 'warning',
      statusLabel: 'Sem base',
      summary: 'Não há dados disponíveis para analisar este motorista no filtro atual.',
      recommendation: 'Sem base suficiente para leitura operacional.',
      highlights: [],
    }
  }

  const onTime = driver.etaDestMetrics.onTime
  const early = driver.etaDestMetrics.early
  const delay = driver.etaDestMetrics.delay
  const occurrenceRate = trips.length ? (driver.ocorrencias / trips.length) * 100 : 0
  const averageScore = trips.length ? driver.pontuacao / trips.length : 0
  const noShow = evaluationSummary.noShowCount
  const blocked = driver.status === 'BLOQUEADO'

  const isDanger =
    blocked ||
    noShow > 0 ||
    evaluationSummary.behaviorLevel === 'Crítico' ||
    evaluationSummary.communicationLevel === 'Ruim' ||
    delay >= 25 ||
    onTime < 55
  const isSuccess =
    !isDanger &&
    averageScore >= 0.5 &&
    occurrenceRate <= 20 &&
    onTime >= 80 &&
    early <= 10 &&
    delay <= 10 &&
    noShow === 0
  const tone: AnalysisTone = isDanger ? 'danger' : isSuccess ? 'success' : 'warning'

  const statusLabel = blocked
    ? 'Bloqueado'
    : isDanger
      ? 'Não escalar'
      : isSuccess
        ? 'Escalar'
        : 'Atenção'
  const title = isDanger
    ? 'Risco operacional para esta rota'
    : isSuccess
      ? 'Boa opção para esta rota'
      : 'Avaliar antes de escalar'

  const summaryParts: string[] = [
    `On-time no destino de ${onTime.toFixed(1)}% (early ${early.toFixed(1)}%, delay ${delay.toFixed(1)}%) em ${trips.length} viagens.`,
    `Ocorrências em ${occurrenceRate.toFixed(1)}% das viagens (${driver.ocorrencias} no total).`,
    `Comunicação: ${evaluationSummary.communicationLevel}; comportamento: ${evaluationSummary.behaviorLevel}.`,
  ]
  if (noShow > 0) summaryParts.push(`${noShow} no-show(s) registrado(s).`)
  if (blocked) summaryParts.push('Motorista atualmente BLOQUEADO.')
  const summary = summaryParts.join(' ')

  const recommendation = blocked
    ? 'Motorista bloqueado — não disponível para escala até a revisão do bloqueio.'
    : isDanger
      ? 'Evitar escalar nesta rota; priorizar motoristas com melhor on-time e sem no-show.'
      : isSuccess
        ? 'Pode escalar com segurança nesta rota — desempenho consistente.'
        : 'Escalar com acompanhamento; há pontos de atenção no desempenho.'

  const highlights: AnalysisHighlight[] = []
  if (ranking && ranking.position) {
    highlights.push({
      label: 'Rank no filtro',
      value: formatDriverRank(ranking.position, ranking.total),
      helper: 'posição no recorte atual',
      tone: 'neutral',
    })
  }
  highlights.push(
    {
      label: 'On-time destino',
      value: `${onTime.toFixed(1)}%`,
      helper: 'principal métrica de rota',
      tone: onTime >= 80 ? 'success' : onTime >= 55 ? 'warning' : 'danger',
    },
    {
      label: 'Delay destino',
      value: `${delay.toFixed(1)}%`,
      helper: 'atrasos na entrega',
      tone: delay <= 10 ? 'success' : delay < 25 ? 'warning' : 'danger',
    },
    {
      label: 'Ocorrências',
      value: `${occurrenceRate.toFixed(1)}%`,
      helper: `${driver.ocorrencias} em ${trips.length} viagens`,
      tone: occurrenceRate <= 20 ? 'success' : occurrenceRate <= 40 ? 'warning' : 'danger',
    },
    {
      label: 'No-show',
      value: String(noShow),
      helper: 'faltas registradas',
      tone: noShow === 0 ? 'success' : 'danger',
    },
  )

  return { title, tone, statusLabel, summary, recommendation, highlights }
}
