/**
 * Ranking data layer — WRITES to the ride-rank Supabase (server-side).
 *
 * This is the WRITE mirror of ranking.reads.ts. Functions ported 1:1 from:
 *   - ride-rank `src/services/supabaseService.ts` write half (upsertEvaluation,
 *     blockDriver, unblockDriver)
 *   - ride-rank `src/services/routeScoreService.ts` (createRouteScore,
 *     updateRouteScore, deleteRouteScore)
 *
 * The ride-rank app ran these mutations against the same DB (Lamonica Ranking,
 * qbwazymqhfunlhnikbla) so the logic is proven against the exact schema.
 *
 * RLS posture (D-09-03): all 5 tables have `cmd=ALL, roles={public}, qual=true,
 * with_check=true` (RLS is open). The ONLY access control gate is `requireRole`
 * at the endpoint layer (09-03) — this module has NO auth of its own. It trusts
 * that every caller has already verified user identity and role. (T1)
 *
 * SECURITY (T-09-02): never log the rows, the key, or the user identity. Errors
 * propagate to the caller (endpoint decides HTTP status + client message).
 */

import { rankSupabase } from './ranking.supabase';
import type {
  EvaluationRecord,
  DriverBlockRecord,
  RouteScoreRecord,
} from './ranking.types';

// --- Evaluations ---

/**
 * Upsert an evaluation by trip_id.
 *
 * Mirrors `supabaseService.upsertEvaluation` exactly:
 *   - SELECT maybeSingle by trip_id → if found, UPDATE; if not, INSERT.
 *   - Returns the saved record, an `existed` flag (true = EDIÇÃO, false = CRIAÇÃO),
 *     and `before` (the pre-mutation row, used as `dados_antes` in the audit log).
 *
 * The `existed` and `before` values are required by the endpoint (09-03) to:
 *   a) choose the correct `acao` for createEvaluationLog (CRIAÇÃO vs EDIÇÃO)
 *   b) populate `dados_antes` (null for new, the existing row for updates)
 *
 * Upsert-by-trip_id per D-09-06.
 */
export async function upsertEvaluation(
  evaluation: Omit<EvaluationRecord, 'id' | 'created_at' | 'updated_at'>,
): Promise<{ record: EvaluationRecord; existed: boolean; before: EvaluationRecord | null }> {
  // Check if evaluation already exists for this trip
  const { data: existing } = await rankSupabase
    .from('evaluations')
    .select('*')
    .eq('trip_id', evaluation.trip_id)
    .maybeSingle();

  if (existing) {
    const { data, error } = await rankSupabase
      .from('evaluations')
      .update({ ...evaluation, updated_at: new Date().toISOString() } as any)
      .eq('trip_id', evaluation.trip_id)
      .select()
      .single();
    if (error) throw error;
    return {
      record: data as unknown as EvaluationRecord,
      existed: true,
      before: existing as unknown as EvaluationRecord,
    };
  } else {
    const { data, error } = await rankSupabase
      .from('evaluations')
      .insert(evaluation as any)
      .select()
      .single();
    if (error) throw error;
    return {
      record: data as unknown as EvaluationRecord,
      existed: false,
      before: null,
    };
  }
}

// --- Driver Blocks ---

/**
 * Insert a driver block row.
 *
 * Mirrors `supabaseService.blockDriver`. Used for both the auto NO_SHOW block
 * (tipo='NO_SHOW', manual_override=false) and manual blocks (tipo='MANUAL',
 * manual_override=true). The caller sets all fields appropriately (D-09-02).
 */
export async function insertDriverBlock(
  block: Omit<DriverBlockRecord, 'id' | 'updated_at'>,
): Promise<void> {
  const { error } = await rankSupabase.from('driver_blocks').insert(block as any);
  if (error) throw error;
}

/**
 * Unblock all active blocks for a driver.
 *
 * Mirrors `supabaseService.unblockDriver`:
 *   - Sets ativo=false, manual_override=true, data_fim=now, updated_at=now
 *   - Filters by driver_id AND ativo=true (only closes open blocks)
 *
 * manual_override=true per D-09-07 (marks that a human explicitly ended the block).
 */
export async function unblockDriverBlocks(driverId: string): Promise<void> {
  const { error } = await rankSupabase
    .from('driver_blocks')
    .update({
      ativo: false,
      manual_override: true,
      data_fim: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .eq('driver_id', driverId)
    .eq('ativo', true);
  if (error) throw error;
}

// --- Route Scores ---

/**
 * Insert a new route score row and return the saved record.
 *
 * Mirrors `routeScoreService.createRouteScore` but returns the persisted row
 * (with DB-generated id/created_at) instead of void — needed for the audit
 * `dados_depois` and for the endpoint 201 response body.
 */
export async function createRouteScore(
  record: Omit<RouteScoreRecord, 'id' | 'created_at' | 'updated_at'>,
): Promise<RouteScoreRecord> {
  const { data, error } = await rankSupabase
    .from('route_scores')
    .insert(record as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as RouteScoreRecord;
}

/**
 * Update a route score row by id.
 *
 * Mirrors `routeScoreService.updateRouteScore` but returns the updated row
 * (or null if not found) for the audit `dados_depois` and endpoint response.
 */
export async function updateRouteScore(
  id: string,
  patch: Partial<RouteScoreRecord>,
): Promise<RouteScoreRecord | null> {
  const { data, error } = await rankSupabase
    .from('route_scores')
    .update({ ...patch, updated_at: new Date().toISOString() } as any)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as RouteScoreRecord) ?? null;
}

/**
 * Delete a route score row by id.
 *
 * Mirrors `routeScoreService.deleteRouteScore`.
 */
export async function deleteRouteScore(id: string): Promise<void> {
  const { error } = await rankSupabase.from('route_scores').delete().eq('id', id);
  if (error) throw error;
}

// --- Drivers (import) ---

/**
 * Upsert drivers by `driver_id` in batches of 100. Ported 1:1 from ride-rank
 * `supabaseService.upsertDrivers` — replaces `driver_name` for matching ids
 * (`onConflict: 'driver_id'`). Returns the number of rows written. RLS is open
 * (D-09-03) so the anon client writes; the endpoint enforces requireRole.
 */
export async function upsertDrivers(
  drivers: { driver_id: string; driver_name: string }[],
): Promise<number> {
  let count = 0;
  for (let i = 0; i < drivers.length; i += 100) {
    const batch = drivers.slice(i, i + 100).map((d) => ({
      driver_id: d.driver_id,
      driver_name: d.driver_name,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await rankSupabase
      .from('drivers')
      .upsert(batch as any, { onConflict: 'driver_id' });
    if (error) throw error;
    count += batch.length;
  }
  return count;
}
