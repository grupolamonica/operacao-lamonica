/**
 * Ranking write HTTP plugin — 3 mutating endpoints behind requireRole('admin','supervisor').
 *
 * ELYSIA 1.4.28 TYPE-DERIVE NOTE (D-09-08):
 * Using `.use(authGuard)` directly on the plugin (not via requireRole()) ensures the
 * `user` derive propagates into handler type-inference. The role gate is replicated
 * inline via `onBeforeHandle` — exactly what requireRole() does internally (rbac.ts L34-43).
 * This avoids the TypeScript "user does not exist" error caused by `as:'scoped'` not
 * crossing plugin boundaries when consumed via a 3rd-party requireRole instance.
 *
 * SECURITY EQUIVALENCE: `authGuard` (JWT + Redis blacklist) + `onBeforeHandle` role check
 * is byte-for-byte identical to `requireRole('admin','supervisor')`. (T-09-03)
 *
 * Routes:
 *   POST   /api/ranking/evaluations      — upsert evaluation + audit + optional NO_SHOW auto-block
 *   POST   /api/ranking/blocks           — manual driver block + BLOQUEIO_MANUAL audit
 *   PATCH  /api/ranking/blocks/:id       — unblock (ativo=false on active rows + override record) + DESBLOQUEIO audit
 *   POST   /api/ranking/route-scores     — create route score + ROTA_CRIACAO audit + cache bust
 *   PATCH  /api/ranking/route-scores/:id — update route score + ROTA_EDICAO audit + cache bust
 *   DELETE /api/ranking/route-scores/:id — delete route score + ROTA_REMOCAO audit + cache bust
 *
 * SECURITY (T-09-03):
 *   - authGuard requires valid Torre cookie; no cookie → 401. Role check → 403 for non-admin/supervisor.
 *   - operador is NOT read from the body — resolveOperador derives it from user.id (JWT) server-side (T-09-12).
 *   - typebox bodies enforce enum literals + integer clamp on ajuste_manual (T-09-05, D-09-06).
 *
 * PATCH /blocks/:id note: the :id identifies the displayed block row for REST semantics.
 * The actual unblock operation keys on driver_id+ativo (matching ride-rank unblockDriver),
 * so the body still carries driver_id + driver_name.
 */

import { Elysia, t } from 'elysia';
import { authGuard } from '../../lib/rbac';
import {
  evaluateTrip,
  blockDriverManual,
  unblockDriver,
  createRouteScoreLogged,
  updateRouteScoreLogged,
  deleteRouteScoreLogged,
  importDriversLogged,
  updateDriverVinculoLogged,
} from './ranking.write.service';

const vinculoSchema = t.Union([
  t.Literal('TERCEIRO'),
  t.Literal('AGREGADO DEDICADO'),
  t.Literal('TERCEIRO DEDICADO'),
  t.Literal('PME'),
  t.Literal('FROTA'),
  t.Literal('PX'),
  t.Literal('AGREGADO'),
  t.Literal('TERCEIRO (SEVERO)'),
  t.Null(),
]);

// ---------------------------------------------------------------------------
// Typebox enum schemas (D-09-06, T5)
// ---------------------------------------------------------------------------

const comunicacaoSchema = t.Union([
  t.Literal('BOA'),
  t.Literal('REGULAR'),
  t.Literal('RUIM'),
]);

const desvioSchema = t.Union([
  t.Literal('NENHUM'),
  t.Literal('LEVE'),
  t.Literal('GRAVE'),
]);

const posturaSchema = t.Union([
  t.Literal('OK'),
  t.Literal('RUIM'),
]);

// ---------------------------------------------------------------------------
// Plugin — authGuard inline + role check via onBeforeHandle (≡ requireRole)
// ---------------------------------------------------------------------------

export const rankingWritePlugin = new Elysia({ name: 'ranking-write' })
  .use(authGuard)
  // Role gate: admin|supervisor only — equivalent to requireRole('admin','supervisor') (T-09-03)
  .onBeforeHandle(({ user, set }) => {
    if (!['admin', 'supervisor'].includes(user.role)) {
      set.status = 403;
      throw new Error("Forbidden: requires role admin|supervisor");
    }
  })

  // ----- POST /api/ranking/evaluations ------------------------------------------
  .post(
    '/api/ranking/evaluations',
    async ({ body, user, set }) => {
      try {
        const result = await evaluateTrip(body, user.id);
        return { ok: true, blocked: result.blocked };
      } catch (e: any) {
        set.status = 500;
        throw e;
      }
    },
    {
      body: t.Object({
        trip_id:      t.String({ minLength: 1 }),
        driver_id:    t.String({ minLength: 1 }),
        driver_name:  t.String(),
        comunicacao:  comunicacaoSchema,
        atendeu:      t.Boolean(),
        desvio_rota:  desvioSchema,
        postura:      posturaSchema,
        // ajuste_manual clamped to [-20,20] via t.Integer min/max → out-of-range = 422 (T5)
        ajuste_manual: t.Integer({ minimum: -20, maximum: 20 }),
        observacao:   t.Optional(t.String({ maxLength: 1000 })),
      }),
      detail: {
        tags: ['ranking'],
        summary: 'Avaliar viagem — upsert evaluation + audit log + optional NO_SHOW auto-block (admin|supervisor)',
      },
    },
  )

  // ----- POST /api/ranking/blocks -----------------------------------------------
  .post(
    '/api/ranking/blocks',
    async ({ body, user, set }) => {
      try {
        await blockDriverManual(body, user.id);
        return { ok: true };
      } catch (e: any) {
        set.status = 500;
        throw e;
      }
    },
    {
      body: t.Object({
        driver_id:   t.String({ minLength: 1 }),
        driver_name: t.String(),
        motivo:      t.String({ minLength: 1, maxLength: 500 }),
      }),
      detail: {
        tags: ['ranking'],
        summary: 'Bloqueio manual de motorista + BLOQUEIO_MANUAL audit (admin|supervisor)',
      },
    },
  )

  // ----- PATCH /api/ranking/blocks/:id ------------------------------------------
  .patch(
    '/api/ranking/blocks/:id',
    async ({ body, user, set }) => {
      try {
        await unblockDriver(body, user.id);
        return { ok: true };
      } catch (e: any) {
        set.status = 500;
        throw e;
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        driver_id:   t.String({ minLength: 1 }),
        driver_name: t.String(),
      }),
      detail: {
        tags: ['ranking'],
        summary: 'Desbloquear motorista (fecha active blocks + override record) + DESBLOQUEIO audit (admin|supervisor)',
      },
    },
  )

  // ----- POST /api/ranking/route-scores -----------------------------------------
  .post(
    '/api/ranking/route-scores',
    async ({ body, user, set }) => {
      try {
        const row = await createRouteScoreLogged(body, user.id);
        return { ok: true, id: row.id };
      } catch (e: any) {
        set.status = 500;
        throw e;
      }
    },
    {
      body: t.Object({
        origin_code:      t.String({ minLength: 1 }),
        destination_code: t.String({ minLength: 1 }),
        pontuacao:        t.Integer(),
        data_inicio:      t.String({ minLength: 1 }),
        data_fim:         t.Union([t.String(), t.Null()]),
        observacao:       t.Union([t.String({ maxLength: 500 }), t.Null()]),
      }),
      detail: {
        tags: ['ranking'],
        summary: 'Criar pontuação de rota + ROTA_CRIACAO audit + cache bust (admin|supervisor)',
      },
    },
  )

  // ----- PATCH /api/ranking/route-scores/:id ------------------------------------
  .patch(
    '/api/ranking/route-scores/:id',
    async ({ params, body, user, set }) => {
      try {
        const row = await updateRouteScoreLogged(params.id, body, user.id);
        if (!row) {
          set.status = 404;
          return { error: 'Route score not found' };
        }
        return { ok: true };
      } catch (e: any) {
        set.status = 500;
        throw e;
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        origin_code:      t.Optional(t.String()),
        destination_code: t.Optional(t.String()),
        pontuacao:        t.Optional(t.Integer()),
        data_inicio:      t.Optional(t.String()),
        data_fim:         t.Optional(t.Union([t.String(), t.Null()])),
        observacao:       t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
      }),
      detail: {
        tags: ['ranking'],
        summary: 'Atualizar pontuação de rota + ROTA_EDICAO audit + cache bust (admin|supervisor)',
      },
    },
  )

  // ----- DELETE /api/ranking/route-scores/:id -----------------------------------
  .delete(
    '/api/ranking/route-scores/:id',
    async ({ params, user, set }) => {
      try {
        await deleteRouteScoreLogged(params.id, user.id);
        set.status = 204;
        return '';
      } catch (e: any) {
        set.status = 500;
        throw e;
      }
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ['ranking'],
        summary: 'Remover pontuação de rota + ROTA_REMOCAO audit + cache bust (admin|supervisor)',
      },
    },
  )

  // ----- PATCH /api/ranking/drivers/:driver_id/vinculo --------------------------
  .patch(
    '/api/ranking/drivers/:driver_id/vinculo',
    async ({ params, body, user, set }) => {
      try {
        await updateDriverVinculoLogged(
          { driver_id: params.driver_id, driver_name: body.driver_name, vinculo: body.vinculo },
          user.id,
        );
        return { ok: true };
      } catch (e: any) {
        set.status = 500;
        throw e;
      }
    },
    {
      params: t.Object({ driver_id: t.String({ minLength: 1 }) }),
      body: t.Object({
        driver_name: t.String(),
        vinculo: vinculoSchema,
      }),
      detail: {
        tags: ['ranking'],
        summary: 'Editar vínculo canônico do motorista + EDICAO_VINCULO audit (admin|supervisor)',
      },
    },
  )

  // ----- POST /api/ranking/drivers/import ---------------------------------------
  .post(
    '/api/ranking/drivers/import',
    async ({ body, user, set }) => {
      try {
        const { count } = await importDriversLogged(body.drivers, user.id);
        return { ok: true, count };
      } catch (e: any) {
        set.status = 500;
        throw e;
      }
    },
    {
      body: t.Object({
        drivers: t.Array(
          t.Object({
            driver_id: t.String({ minLength: 1 }),
            driver_name: t.String({ minLength: 1 }),
          }),
          { minItems: 1, maxItems: 5000 },
        ),
      }),
      detail: {
        tags: ['ranking'],
        summary: 'Importar motoristas (upsert por driver_id) + IMPORT_MOTORISTAS audit (admin|supervisor)',
      },
    },
  );
