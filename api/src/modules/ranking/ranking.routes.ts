/**
 * Route-score resolution — pure layer.
 *
 * Ported 1:1 from ride-rank `src/services/routeScoreService.ts`
 * (`getRouteBasePoints`, ~L44-69). This is the SINGLE SOURCE of the route
 * base-points rule: ranking.scoring.ts imports `getRouteBasePoints` from here
 * instead of duplicating it (prevents parity drift; see T-07-13).
 *
 * The READ of the `route_scores` table (fetchRouteScores) lives in the data
 * layer (Plan 03). The write operations (create/update/delete) are Phase 9.
 */

import type { RouteScoreRecord } from './ranking.types';

/** Get active score for a route on a given date */
export function getRouteBasePoints(
  routeScores: RouteScoreRecord[],
  originCode: string,
  destinationCode: string,
  tripDate?: string,
): number {
  const matching = routeScores.filter(
    (rs) => rs.origin_code === originCode && rs.destination_code === destinationCode,
  );

  if (matching.length === 0) return 1; // default

  // Find the active record for the trip date
  const refDate = tripDate ? new Date(tripDate) : new Date();

  for (const rs of matching) {
    const start = new Date(rs.data_inicio);
    const end = rs.data_fim ? new Date(rs.data_fim) : null;
    if (refDate >= start && (!end || refDate <= end)) {
      return rs.pontuacao;
    }
  }

  // If no date match, return latest
  return matching[0]?.pontuacao ?? 1;
}
