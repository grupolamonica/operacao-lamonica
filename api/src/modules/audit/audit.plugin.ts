/**
 * audit.plugin.ts — GET /api/audit (admin-only).
 *
 * Feed unificado das ações dos operadores p/ a tela de Auditoria do admin.
 *
 * GATE: usa authGuard DIRETO (derive `as:'scoped'` chega nas rotas deste plugin →
 * 401 sem sessão) + checagem de role na própria rota (403 p/ não-admin). NÃO usa
 * requireRole: o onBeforeHandle dele é 'local' e o derive scoped só sobe 1 nível,
 * então o guard não alcança a rota do consumidor (rotas ficariam ABERTAS). O
 * servidor é a fonte da verdade do gate — a tela só esconde no client.
 */
import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getOperatorAudit, type AuditCategory } from './audit.service'

export const auditPlugin = new Elysia({ name: 'audit' })
  .use(authGuard)
  .get(
    '/api/audit',
    ({ user, query, set }) => {
      if (user.role !== 'admin') {
        set.status = 403
        return { error: 'Forbidden: requires role admin' }
      }
      return getOperatorAudit({
        inicio:     query.inicio ?? null,
        fim:        query.fim ?? null,
        operatorId: query.operatorId ?? null,
        category:   (query.category as AuditCategory | undefined) ?? null,
      })
    },
    {
      query: t.Object({
        inicio:     t.Optional(t.String()),
        fim:        t.Optional(t.String()),
        operatorId: t.Optional(t.String()),
        category:   t.Optional(t.Union([
          t.Literal('nota'),
          t.Literal('tratativa'),
          t.Literal('comunicacao'),
          t.Literal('status_operacional'),
        ])),
      }),
      detail: {
        tags: ['audit'],
        summary: 'Feed unificado das ações dos operadores (admin) — filtros por período e operador',
      },
    },
  )
