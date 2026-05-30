/**
 * Ranking write orchestrators — server-side replication of ride-rank DataContext write flows.
 *
 * Each exported function composes the 09-01 data-layer helpers
 * (ranking.writes.ts + ranking.audit.ts + ranking.cache.ts) into a single
 * logical operation per mutation type:
 *   - evaluateTrip    → upsert + CRIAÇÃO/EDIÇÃO log + conditional NO_SHOW auto-block + bust
 *   - blockDriverManual → MANUAL block + BLOQUEIO_MANUAL log + bust
 *   - unblockDriver   → bulk unblock + override record + DESBLOQUEIO log + bust
 *
 * `operador` is resolved SERVER-SIDE from the authenticated Torre user's id against
 * the Torre `users` table — the JWT carries only { id, role, jti }, no name
 * (confirmed: authGuard / auth.plugin /me = {id, role}). Never trust a client-supplied
 * operador. (T-09-12)
 *
 * AUDIT ATOMICITY (T4, D-09-05): the primary audit log is awaited and its failure
 * propagates (the whole request fails if the log can't be written — ride-rank
 * swallowed block errors with try/catch; Torre PROPAGATES so the operator sees the
 * failure rather than a silent missing block). These are sequential Supabase calls
 * (no real DB transaction across the REST API). "Atomic" here means "same handler,
 * fail-fast on first error, primary audit awaited before returning success".
 *
 * SECURITY (T-09-02): never log driver PII, evaluation contents, or the operador
 * identity. Errors propagate to the endpoint/plugin layer.
 *
 * Ride-rank source:
 *   - DataContext.tsx evaluateTrip (L220-285)
 *   - DataContext.tsx unblockDriverFn (L287-324)
 *   - EvaluationForm "Bloquear" path → blockDriver MANUAL
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { users } from '../../db/schema/users';
import {
  upsertEvaluation,
  insertDriverBlock,
  unblockDriverBlocks,
  createRouteScore,
  updateRouteScore,
  deleteRouteScore,
} from './ranking.writes';
import type { RouteScoreRecord } from './ranking.types';
import { createEvaluationLog } from './ranking.audit';
import { bustRankingCache } from './ranking.cache';

// ---------------------------------------------------------------------------
// Operador resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the Torre user's display name for use as `operador` in audit logs.
 *
 * Queries the Torre `users` table by the JWT-extracted `user.id`.
 * Falls back: name → email → raw id (guarantees a non-empty string even if the
 * user row is missing — e.g. a race between user deletion and an in-flight request).
 *
 * This is the ONLY place operador is determined — no client-supplied value is
 * ever trusted (T-09-12).
 */
export async function resolveOperador(userId: string): Promise<string> {
  const [row] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.name || row?.email || userId;
}

// ---------------------------------------------------------------------------
// evaluateTrip — upsert + audit + conditional NO_SHOW auto-block + cache bust
// ---------------------------------------------------------------------------

export interface EvaluateTripInput {
  trip_id: string;
  driver_id: string;
  driver_name: string;
  comunicacao: string;
  atendeu: boolean;
  desvio_rota: string;
  postura: string;
  ajuste_manual: number;
  observacao?: string;
}

/**
 * Evaluate a trip (upsert evaluation) with full audit trail and optional auto-block.
 *
 * Replicates ride-rank DataContext.evaluateTrip exactly:
 *   1. Resolve operador from the Torre users table.
 *   2. Build the evaluation record.
 *   3. Upsert via ranking.writes.upsertEvaluation → get { existed, before }.
 *   4. Write CRIAÇÃO or EDIÇÃO log (primary audit — awaited, failure propagates).
 *   5. If !atendeu: insert NO_SHOW driver block + write BLOQUEIO_NO_SHOW log.
 *   6. Bust the ranking cache.
 *   7. Return { blocked } so the endpoint can surface it to the caller.
 *
 * Divergence from ride-rank (deliberate): ride-rank swallowed the block step in
 * try/catch (console.error). Torre propagates — the operator sees the failure
 * instead of silently missing the block record.
 */
export async function evaluateTrip(
  input: EvaluateTripInput,
  userId: string,
): Promise<{ blocked: boolean }> {
  const operador = await resolveOperador(userId);

  const record = {
    trip_id: input.trip_id,
    driver_id: input.driver_id,
    driver_name: input.driver_name,
    comunicacao: input.comunicacao,
    atendeu: input.atendeu,
    desvio_rota: input.desvio_rota,
    postura: input.postura,
    ajuste_manual: input.ajuste_manual,
    observacao: input.observacao ?? '',
    operador,
  };

  // Step 3: upsert — returns { existed, before } to drive log acao + dados_antes
  const { existed, before } = await upsertEvaluation(record);

  // Step 4: primary audit log — AWAITED; failure propagates (T4)
  await createEvaluationLog({
    trip_id: input.trip_id,
    driver_id: input.driver_id,
    driver_name: input.driver_name,
    operador,
    acao: existed ? 'EDIÇÃO' : 'CRIAÇÃO',
    dados_antes: before as Record<string, unknown> | null,
    dados_depois: record as Record<string, unknown>,
  });

  let blocked = false;

  // Step 5: auto-block NO_SHOW — no threshold; 1 no-show = immediate block (D-09-02)
  if (!input.atendeu) {
    await insertDriverBlock({
      driver_id: input.driver_id,
      driver_name: input.driver_name,
      tipo: 'NO_SHOW',
      motivo: `No-Show na viagem ${input.trip_id}`,
      ativo: true,
      manual_override: false,
      data_inicio: new Date().toISOString(),
      data_fim: null,
      created_by: operador,
    });

    await createEvaluationLog({
      driver_id: input.driver_id,
      driver_name: input.driver_name,
      operador,
      acao: 'BLOQUEIO_NO_SHOW',
      dados_antes: null,
      dados_depois: { status: 'BLOQUEADO', motivo: 'NO_SHOW', trip_id: input.trip_id },
    });

    blocked = true;
  }

  // Step 6: bust ranking cache (D-09-04/09)
  await bustRankingCache();

  return { blocked };
}

// ---------------------------------------------------------------------------
// blockDriverManual — MANUAL block + BLOQUEIO_MANUAL log + cache bust
// ---------------------------------------------------------------------------

export interface BlockDriverManualInput {
  driver_id: string;
  driver_name: string;
  motivo: string;
}

/**
 * Insert a manual driver block with a BLOQUEIO_MANUAL audit log.
 *
 * Replicates the ride-rank EvaluationForm "Bloquear" path:
 *   1. Resolve operador.
 *   2. Insert MANUAL block (ativo=true, manual_override=false).
 *   3. Write BLOQUEIO_MANUAL log.
 *   4. Bust cache.
 */
export async function blockDriverManual(
  input: BlockDriverManualInput,
  userId: string,
): Promise<void> {
  const operador = await resolveOperador(userId);
  const now = new Date().toISOString();

  await insertDriverBlock({
    driver_id: input.driver_id,
    driver_name: input.driver_name,
    tipo: 'MANUAL',
    motivo: input.motivo,
    ativo: true,
    manual_override: false,
    data_inicio: now,
    data_fim: null,
    created_by: operador,
  });

  await createEvaluationLog({
    driver_id: input.driver_id,
    driver_name: input.driver_name,
    operador,
    acao: 'BLOQUEIO_MANUAL',
    dados_antes: null,
    dados_depois: { status: 'BLOQUEADO', motivo: input.motivo, tipo: 'MANUAL' },
  });

  await bustRankingCache();
}

// ---------------------------------------------------------------------------
// unblockDriver — bulk unblock + override record + DESBLOQUEIO log + cache bust
// ---------------------------------------------------------------------------

export interface UnblockDriverInput {
  driver_id: string;
  driver_name: string;
}

/**
 * Unblock a driver: close active blocks + insert an override record + audit log.
 *
 * Replicates ride-rank DataContext.unblockDriverFn exactly:
 *   1. Resolve operador.
 *   2. unblockDriverBlocks(driver_id) — sets ativo=false, data_fim=now,
 *      manual_override=true on all active rows.
 *   3. Insert a MANUAL/ativo=false override record (so score-based blocks that
 *      have no DB row are also overridden — ride-rank DataContext L291-304).
 *   4. Write DESBLOQUEIO log.
 *   5. Bust cache.
 *
 * The :id param on PATCH /blocks/:id identifies the displayed block for REST
 * semantics, but the actual DB update keys on driver_id+ativo — matching ride-rank.
 */
export async function unblockDriver(
  input: UnblockDriverInput,
  userId: string,
): Promise<void> {
  const operador = await resolveOperador(userId);
  const now = new Date().toISOString();

  // Step 2: close all active blocks for this driver
  await unblockDriverBlocks(input.driver_id);

  // Step 3: insert override record (manual_override=true, ativo=false)
  await insertDriverBlock({
    driver_id: input.driver_id,
    driver_name: input.driver_name,
    tipo: 'MANUAL',
    motivo: 'Desbloqueio manual pelo operador',
    ativo: false,
    manual_override: true,
    data_inicio: now,
    data_fim: now,
    created_by: operador,
  });

  // Step 4: DESBLOQUEIO audit log
  await createEvaluationLog({
    driver_id: input.driver_id,
    driver_name: input.driver_name,
    operador,
    acao: 'DESBLOQUEIO',
    dados_antes: { status: 'BLOQUEADO' },
    dados_depois: { status: 'ATIVO' },
  });

  // Step 5: bust cache
  await bustRankingCache();
}

// ---------------------------------------------------------------------------
// Route-score mutations — ROTA_CRIACAO / ROTA_EDICAO / ROTA_REMOCAO
//
// Route base-points drive the derived score (getRouteBasePoints → transformTrips).
// Editing them must be audited with the analogous taxonomy (D-09-05) and must
// bust the cache so the next read recomputes scores with the updated base points
// (D-09-04).  operador is server-resolved (T-09-12).  No driver/trip ids on these
// logs — the route identity lives in dados_*.
//
// Audit note for ROTA_EDICAO: dados_antes carries { id } (the route being edited)
// rather than a full pre-image snapshot — the full row is not re-fetched to keep
// it one query.  This is a minor deliberate divergence from the full-snapshot
// pattern used in EDIÇÃO (evaluations), documented here.
// ---------------------------------------------------------------------------

/**
 * Create a route score row + ROTA_CRIACAO audit log + cache bust.
 */
export async function createRouteScoreLogged(
  input: Omit<RouteScoreRecord, 'id' | 'created_at' | 'updated_at'>,
  userId: string,
): Promise<RouteScoreRecord> {
  const operador = await resolveOperador(userId);
  const row = await createRouteScore(input);
  await createEvaluationLog({
    operador,
    acao: 'ROTA_CRIACAO',
    dados_antes: null,
    dados_depois: { ...input } as Record<string, unknown>,
  });
  await bustRankingCache();
  return row;
}

/**
 * Update a route score row + ROTA_EDICAO audit log + cache bust.
 *
 * dados_antes carries { id } — full pre-image not re-fetched (one-query design).
 */
export async function updateRouteScoreLogged(
  id: string,
  patch: Partial<RouteScoreRecord>,
  userId: string,
): Promise<RouteScoreRecord | null> {
  const operador = await resolveOperador(userId);
  const row = await updateRouteScore(id, patch);
  await createEvaluationLog({
    operador,
    acao: 'ROTA_EDICAO',
    dados_antes: { id } as Record<string, unknown>,
    dados_depois: { id, ...patch } as Record<string, unknown>,
  });
  await bustRankingCache();
  return row;
}

/**
 * Delete a route score row + ROTA_REMOCAO audit log + cache bust.
 */
export async function deleteRouteScoreLogged(
  id: string,
  userId: string,
): Promise<void> {
  const operador = await resolveOperador(userId);
  await deleteRouteScore(id);
  await createEvaluationLog({
    operador,
    acao: 'ROTA_REMOCAO',
    dados_antes: { id } as Record<string, unknown>,
    dados_depois: null,
  });
  await bustRankingCache();
}
