/**
 * Ranking data layer — audit log helper.
 *
 * Exports ONE audit helper: `createEvaluationLog`. Every ranking mutation (evaluate,
 * block, unblock, route-score CRUD) calls this helper in the same logical operation
 * so the audit is structurally impossible to forget (D-09-05, T4).
 *
 * Ported 1:1 from ride-rank `src/services/supabaseService.ts` lines 161-164
 * (`createEvaluationLog`). Uses `rankSupabase` (the same lazy Proxy used by
 * ranking.reads.ts) so the module-load is side-effect-free.
 *
 * `operador` comes from the authenticated Torre user — resolved by the endpoint layer
 * (09-03) that extracts user identity from the JWT via `authGuard`. This module
 * accepts it as a plain string parameter and does NOT perform its own auth.
 *
 * `dados_antes` / `dados_depois` are jsonb in the `evaluation_logs` table. Pass the
 * full row snapshot (before the mutation for `dados_antes`, after for `dados_depois`).
 *
 * SECURITY (T-09-02 / T-07-06 carry-over): never log the row contents (driver PII,
 * evaluation details, operador identity). Errors propagate to the caller.
 */

import { rankSupabase } from './ranking.supabase';
import type { EvaluationLogRecord } from './ranking.types';

/**
 * Inserts a single row into `evaluation_logs`.
 *
 * Throws the Supabase error on failure — the endpoint decides whether to make this
 * best-effort or fatal (D-09-05 intent: log should be mandatory; failure = fail the op).
 */
export async function createEvaluationLog(
  log: Omit<EvaluationLogRecord, 'id' | 'created_at'>,
): Promise<void> {
  const { error } = await rankSupabase.from('evaluation_logs').insert(log as any);
  if (error) throw error;
}
