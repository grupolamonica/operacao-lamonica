/**
 * Ranking data layer — READS from the ride-rank Supabase (server-side).
 *
 * Ported from ride-rank `src/services/supabaseService.ts` (fetch* readers) and
 * `src/services/routeScoreService.ts` (`fetchRouteScores`). ONLY the read
 * functions are ported here — the upsert/block/unblock/log-write/route-score
 * mutations are Phase 9 writes and are intentionally omitted.
 *
 * Differences from the ride-rank source:
 *   - Uses `rankSupabase` (service_role client from Plan 01) instead of the
 *     browser `supabase` client. service_role BYPASSES RLS, so all 5 tables are
 *     readable server-side (D-V2-01 PROXY).
 *   - Record shapes are imported from `./ranking.types` (single source, Plan 02)
 *     rather than redefined locally.
 *
 * The pure `getRouteBasePoints` rule is NOT here — it lives in `./ranking.routes`
 * (Plan 02). This module only READS the `route_scores` table via
 * `fetchRouteScores`.
 *
 * SECURITY (T-07-06): never log the returned rows (driver PII / evaluations) nor
 * the service_role. Errors propagate to the caller (Plan 04 endpoints handle them).
 */

import { rankSupabase } from './ranking.supabase';
import type {
  EvaluationRecord,
  DriverBlockRecord,
  EvaluationLogRecord,
  RouteScoreRecord,
  DriverRecord,
} from './ranking.types';

// --- Evaluations ---

export async function fetchEvaluations(): Promise<EvaluationRecord[]> {
  const { data, error } = await rankSupabase.from('evaluations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as EvaluationRecord[];
}

// --- Driver Blocks ---

export async function fetchDriverBlocks(): Promise<DriverBlockRecord[]> {
  const { data, error } = await rankSupabase.from('driver_blocks')
    .select('*')
    .order('data_inicio', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DriverBlockRecord[];
}

// --- Evaluation Logs ---

export async function fetchEvaluationLogs(): Promise<EvaluationLogRecord[]> {
  const { data, error } = await rankSupabase.from('evaluation_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as EvaluationLogRecord[];
}

// --- Route Scores (READ only; the pure getRouteBasePoints lives in ranking.routes) ---

export async function fetchRouteScores(): Promise<RouteScoreRecord[]> {
  const { data, error } = await rankSupabase.from('route_scores')
    .select('*')
    .order('origin_code')
    .order('data_inicio', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as RouteScoreRecord[];
}

// --- Drivers (paginated — may exceed the default 1000-row Supabase limit) ---

export async function fetchDrivers(): Promise<DriverRecord[]> {
  const allDrivers: DriverRecord[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await rankSupabase.from('drivers')
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allDrivers.push(...(data as unknown as DriverRecord[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allDrivers;
}
