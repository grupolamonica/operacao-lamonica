/**
 * Ranking composition service — orchestrates the pure scoring layer
 * (ranking.scoring.ts / ranking.routes.ts) with the I/O layer
 * (ranking.reads.ts / ranking.sheets.ts) into the HTTP contract consumed by the
 * Phase 8 front-end (Eden Treaty).
 *
 * `composeRanking` is a PURE function (no I/O) that replicates, in the EXACT
 * order, the ride-rank `DataContext` useMemo (~L127-218):
 *
 *   1. transformTrips(sheetTrips, ignoredOccurrences, routeScores)   (FECHADA only)
 *   2. enrich driverName via DriverRecord map (driver_id with dots removed)
 *   3. (optional) dateRange filter on the trips (parseDateBR), mirroring the app
 *   4. apply evaluations: score_final = clamp(0..100, score_final + ajuste_manual);
 *      evaluated = true
 *   5. activelyBlockedIds = Set(driver_blocks where ativo === true && manual_override === false)
 *   6. deriveDrivers(t)                                              (sorted pontuacao desc)
 *   7. status = activelyBlockedIds.has(id) ? 'BLOQUEADO' : 'ATIVO'
 *   8. rank = sequential 1..N over the ATIVO drivers only (BLOQUEADO → rank: null)
 *   9. activeDrivers = drivers.filter(status !== 'BLOQUEADO')
 *
 * NOTE (parity, this read-only phase): the ride-rank `DataContext` also enriches
 * `vinculo` via `vinculoService` and derives a `blocks` UI shape via `deriveBlocks`.
 * Neither is in scope here — Phase 7 ships no `fetchVinculos` read, so `vinculo`
 * keeps the `deriveDrivers` default (matching the app when vinculos are not yet
 * loaded), and `/blocks` returns the raw active DriverBlockRecord[] instead of the
 * UI-derived shape.
 *
 * SECURITY (T-07-06): never log the composed rows (driver PII / evaluations).
 */

import {
  deriveDrivers,
  getVinculoForDriver,
  parseDateBR,
  transformTrips,
} from './ranking.scoring';
import {
  fetchDriverBlocks,
  fetchDrivers,
  fetchEvaluationLogs,
  fetchEvaluations,
  fetchRouteScores,
} from './ranking.reads';
import { getSheetTrips, fetchVinculos } from './ranking.sheets';
import type {
  Driver,
  DriverBlockRecord,
  DriverRecord,
  EvaluationLogRecord,
  EvaluationRecord,
  RouteScoreRecord,
  SheetTrip,
  Trip,
  VinculoRecord,
} from './ranking.types';

/**
 * Occurrences ignored by default in the score (copied 1:1 from the ride-rank
 * `DataContext.DEFAULT_IGNORED_OCCURRENCES`, ~L11-17). The original lets the
 * operator override these via localStorage; server-side there is no per-user
 * state in this read-only phase, so the defaults are always applied (parity with
 * a fresh client that never touched the setting).
 */
export const DEFAULT_IGNORED_OCCURRENCES = [
  'Atraso na portaria Shopee',
  'Morosidade no carregamento',
  'Problema sistêmico Shopee (CTE/API)',
  'Saída antecipada do CPT - Early',
  'Solicitação Shopee para antecipação de chegada - Early',
];

/** A Driver enriched with its ranking position. `rank` is the sequential
 *  1..N position counting ONLY ATIVO drivers (in pontuacao-desc order);
 *  BLOQUEADO drivers get `rank: null`. This is the FIXED `/drivers` contract. */
export type RankedDriver = Driver & { rank: number | null };

export interface DateRangeInput {
  /** Inclusive lower bound (BR `dd/MM/yyyy [HH:mm:ss]` string), optional. */
  from?: string;
  /** Inclusive upper bound (BR `dd/MM/yyyy [HH:mm:ss]` string), optional. */
  to?: string;
}

/** Optional per-request overrides for the ranking composition (driven by the
 *  front-end filter bar). `ignoredOccurrences` undefined → DEFAULT_IGNORED_OCCURRENCES
 *  (composeRanking default); `[]` → ignore nothing (full re-score). */
export interface RankingQueryOpts {
  ignoredOccurrences?: string[];
  dateRange?: DateRangeInput;
}

export interface RankingStats {
  activeDrivers: number;
  top3Avg: number;
  totalTrips: number;
  activeBlocks: number;
}

export interface ComposeRankingInput {
  sheetTrips: SheetTrip[];
  evaluations: EvaluationRecord[];
  driverBlocks: DriverBlockRecord[];
  routeScores: RouteScoreRecord[];
  drivers: DriverRecord[];
  /** Driver→vinculo map from the public vinculo sheet (optional; absent in pure
   *  unit tests, where drivers keep the byte-for-byte '—' fallback). */
  vinculos?: VinculoRecord[];
  ignoredOccurrences?: string[];
  dateRange?: DateRangeInput;
}

export interface ComposeRankingResult {
  /** Trips used in the ranking — FECHADA only, ajuste_manual applied. */
  trips: Trip[];
  /** Full driver array (ATIVO + BLOQUEADO), pontuacao desc, with status + rank. */
  drivers: RankedDriver[];
  /** Subset of `drivers` whose status !== 'BLOQUEADO'. */
  activeDrivers: RankedDriver[];
  /** Aggregate metrics for the /stats endpoint. */
  stats: RankingStats;
}

const normalizeDriverId = (id: string): string => id.replace(/\./g, '');

/** Mirrors the DataContext date-range filter: keep trips whose parsed BR date
 *  falls within [from, to] (to is widened to end-of-day, matching the app). */
function tripInRange(trip: Trip, from: Date | null, to: Date | null): boolean {
  const tripDate = parseDateBR(trip.data);
  if (!tripDate) return false;
  if (from && tripDate < from) return false;
  if (to) {
    const endOfDay = new Date(to);
    endOfDay.setHours(23, 59, 59, 999);
    if (tripDate > endOfDay) return false;
  }
  return true;
}

/**
 * Pure composition of the ranking — no I/O. Replicates the ride-rank
 * `DataContext` useMemo in the exact order documented above.
 */
export function composeRanking(input: ComposeRankingInput): ComposeRankingResult {
  const {
    sheetTrips,
    evaluations,
    driverBlocks,
    routeScores,
    drivers: driverRecords,
    vinculos,
    ignoredOccurrences = DEFAULT_IGNORED_OCCURRENCES,
    dateRange,
  } = input;

  // 1. FECHADA-only trips with route base points + score_final.
  let trips = transformTrips(sheetTrips, ignoredOccurrences, routeScores);

  // 2. Enrich driverName from the drivers table (map keyed by dot-stripped id).
  const driverNameMap = new Map(
    driverRecords.map((d) => [normalizeDriverId(d.driver_id), d.driver_name]),
  );
  if (driverNameMap.size > 0) {
    trips = trips.map((trip) => {
      const enrichedName = driverNameMap.get(normalizeDriverId(trip.driver_id));
      return enrichedName ? { ...trip, driverName: enrichedName } : trip;
    });
  }

  // 3. Optional date-range filter (applied to trips BEFORE evaluations, as in app).
  const from = dateRange?.from ? parseDateBR(dateRange.from) : null;
  const to = dateRange?.to ? parseDateBR(dateRange.to) : null;
  if (from || to) {
    trips = trips.filter((trip) => tripInRange(trip, from, to));
  }

  // 4. Apply evaluations: score_final = clamp(0..100, score_final + ajuste_manual).
  const evalMap = new Map(evaluations.map((e) => [e.trip_id, e]));
  trips = trips.map((trip) => {
    const ev = evalMap.get(trip.id);
    if (ev) {
      const ajuste = ev.ajuste_manual || 0;
      const adjusted = Math.max(0, Math.min(100, trip.score_final + ajuste));
      return { ...trip, score_final: adjusted, evaluated: true };
    }
    return trip;
  });

  // 5. Actively blocked drivers (NO_SHOW or MANUAL, not overridden).
  const activelyBlockedIds = new Set(
    driverBlocks.filter((b) => b.ativo && !b.manual_override).map((b) => b.driver_id),
  );

  // 6. Aggregate drivers (already sorted pontuacao desc). Enrich `vinculo` by
  //    name from the vinculo sheet when available (parity with the ride-rank
  //    DataContext); without it, deriveDrivers keeps the '—' fallback.
  const getVinculo =
    vinculos && vinculos.length > 0
      ? (driverName: string) => getVinculoForDriver(vinculos, driverName)
      : undefined;
  const derived = deriveDrivers(trips, getVinculo);

  // 7 + 8. Status + rank (rank counts only ATIVO drivers, 1..N).
  let activeRank = 0;
  const drivers: RankedDriver[] = derived.map((driver) => {
    const status = activelyBlockedIds.has(driver.id) ? 'BLOQUEADO' : 'ATIVO';
    if (status === 'BLOQUEADO') {
      return { ...driver, status, rank: null };
    }
    activeRank += 1;
    return { ...driver, status, rank: activeRank };
  });

  // 9. Active subset.
  const activeDrivers = drivers.filter((d) => d.status !== 'BLOQUEADO');

  const stats = computeStats(trips, activeDrivers, driverBlocks);

  return { trips, drivers, activeDrivers, stats };
}

/** Derives the /stats aggregate. top3Avg = mean pontuacao of the top-3 ATIVO
 *  drivers (already pontuacao-desc); 0 when there are none. */
function computeStats(
  trips: Trip[],
  activeDrivers: RankedDriver[],
  driverBlocks: DriverBlockRecord[],
): RankingStats {
  const top3 = activeDrivers.slice(0, 3);
  const top3Avg =
    top3.length > 0
      ? Math.round((top3.reduce((sum, d) => sum + d.pontuacao, 0) / top3.length) * 10) / 10
      : 0;

  return {
    activeDrivers: activeDrivers.length,
    top3Avg,
    totalTrips: trips.length,
    activeBlocks: driverBlocks.filter((b) => b.ativo).length,
  };
}

// ---------------------------------------------------------------------------
// Service orchestrators (I/O) — fetch the layers and compose.
// ---------------------------------------------------------------------------

/** Fetch all inputs needed for composition in parallel. */
async function loadRankingInputs(): Promise<{
  sheetTrips: SheetTrip[];
  evaluations: EvaluationRecord[];
  driverBlocks: DriverBlockRecord[];
  routeScores: RouteScoreRecord[];
  drivers: DriverRecord[];
  vinculos: VinculoRecord[];
}> {
  const [sheetTrips, evaluations, driverBlocks, routeScores, drivers, vinculos] = await Promise.all([
    getSheetTrips(),
    fetchEvaluations(),
    fetchDriverBlocks(),
    fetchRouteScores(),
    fetchDrivers(),
    fetchVinculos(),
  ]);
  return { sheetTrips, evaluations, driverBlocks, routeScores, drivers, vinculos };
}

/**
 * GET /api/ranking/drivers — the FIXED contract: the FULL Driver array
 * (ATIVO + BLOQUEADO), ordered by pontuacao desc, each with `status` and `rank`
 * (1..N over ATIVO; BLOQUEADO → null). The UI filters by status.
 */
export async function getRankingDrivers(opts: RankingQueryOpts = {}): Promise<RankedDriver[]> {
  const inputs = await loadRankingInputs();
  return composeRanking({ ...inputs, ignoredOccurrences: opts.ignoredOccurrences, dateRange: opts.dateRange }).drivers;
}

/**
 * GET /api/ranking/trips — FECHADA trips only (with ajuste_manual applied),
 * optional from/to date filter. NO SHOW trips are NOT concatenated here.
 */
export async function getRankingTrips(opts: RankingQueryOpts = {}): Promise<Trip[]> {
  const inputs = await loadRankingInputs();
  return composeRanking({ ...inputs, ignoredOccurrences: opts.ignoredOccurrences, dateRange: opts.dateRange }).trips;
}

/** GET /api/ranking/blocks — active driver blocks only. */
export async function getRankingBlocks(): Promise<DriverBlockRecord[]> {
  const blocks = await fetchDriverBlocks();
  return blocks.filter((b) => b.ativo === true);
}

/** GET /api/ranking/route-scores — all route scores. */
export async function getRankingRouteScores(): Promise<RouteScoreRecord[]> {
  return fetchRouteScores();
}

/** GET /api/ranking/stats — { activeDrivers, top3Avg, totalTrips, activeBlocks }. */
export async function getRankingStats(opts: RankingQueryOpts = {}): Promise<RankingStats> {
  const inputs = await loadRankingInputs();
  return composeRanking({ ...inputs, ignoredOccurrences: opts.ignoredOccurrences, dateRange: opts.dateRange }).stats;
}

/** GET /api/ranking/logs — evaluation_logs ordered desc, limit 200 (D-09-07). Any authenticated role reads. */
export async function getRankingLogs(): Promise<EvaluationLogRecord[]> {
  return fetchEvaluationLogs();
}

/** GET /api/ranking/evaluations — all operator evaluations (read-only). Feeds the
 *  driver-details modal's quality summary + "Análise da Lamônica" (parity with the
 *  ride-rank DataContext, which loads evaluations client-side). Any authenticated role. */
export async function getRankingEvaluations(): Promise<EvaluationRecord[]> {
  return fetchEvaluations();
}
