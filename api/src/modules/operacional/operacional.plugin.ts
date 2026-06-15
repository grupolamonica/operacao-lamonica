/**
 * Controle Operacional HTTP plugin — todas as rotas atrás do authGuard (cookie Torre).
 *
 *   GET   /api/operacional/viagens            — viagens da SPX (asp, cacheado) + override de status
 *   GET   /api/operacional/movimentacoes      — últimas alterações de status (movimentações)
 *   GET   /api/operacional/viagens/:lh/log    — histórico de status de uma viagem (Log)
 *   PATCH /api/operacional/viagens/:lh/status — operador altera o status operacional
 *
 * As rotas ficam dentro de `.group('/api/operacional', …)` — mesmo padrão de
 * cargas/drivers/alerts/trips. Isso garante que o derive `as:'scoped'` do authGuard
 * (que injeta `user` e barra sem cookie) propague na composição do app; com rotas
 * de caminho completo direto na instância o derive não aplicava e dava 500.
 *
 * operador NÃO vem do body — resolveOperador deriva do user.id (JWT) server-side.
 */
import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { resolveOperador } from '../ranking/ranking.write.service'
import {
  getOperacionalViagens,
  getMovimentacoes,
  getLhLog,
  setOpStatus,
  OP_STATUSES,
} from './operacional.service'

const OP_SET: ReadonlySet<string> = new Set(OP_STATUSES)

export const operacionalPlugin = new Elysia({ name: 'operacional' })
  .use(authGuard)
  .group('/api/operacional', (app) =>
    app
      .get(
        '/viagens',
        async ({ set }) => {
          try {
            return { ok: true, viagens: await getOperacionalViagens() }
          } catch (e: any) {
            set.status = 502
            return { ok: false, error: e?.message ?? 'falha ao ler SPX', viagens: [] }
          }
        },
        { detail: { tags: ['operacional'], summary: 'Viagens da SPX (asp) + override de status operacional' } },
      )
      .get(
        '/movimentacoes',
        async () => ({ ok: true, movimentacoes: await getMovimentacoes(12) }),
        { detail: { tags: ['operacional'], summary: 'Últimas alterações de status operacional' } },
      )
      .get(
        '/viagens/:lh/log',
        async ({ params }) => ({ ok: true, log: await getLhLog(params.lh) }),
        {
          params: t.Object({ lh: t.String() }),
          detail: { tags: ['operacional'], summary: 'Histórico de status de uma viagem' },
        },
      )
      .patch(
        '/viagens/:lh/status',
        async ({ params, body, user, set }) => {
          if (!OP_SET.has(body.status)) {
            set.status = 422
            return { ok: false, error: `status inválido: ${body.status}` }
          }
          try {
            const operador = await resolveOperador(user.id)
            await setOpStatus(params.lh, body.status, operador)
            return { ok: true }
          } catch (e: any) {
            set.status = 500
            return { ok: false, error: e?.message ?? 'falha ao salvar status' }
          }
        },
        {
          params: t.Object({ lh: t.String() }),
          body: t.Object({ status: t.String() }),
          detail: { tags: ['operacional'], summary: 'Alterar status operacional (override do operador)' },
        },
      ),
  )
