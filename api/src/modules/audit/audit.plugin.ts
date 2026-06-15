/**
 * audit.plugin.ts — GET /api/audit (admin-only).
 *
 * Feed unificado das ações dos operadores p/ a tela de Auditoria do admin.
 * requireRole('admin') encadeia authGuard e devolve 403 a não-admins — a tela
 * é só de leitura/supervisão; o servidor é a fonte da verdade do gate.
 */
import { Elysia, t } from 'elysia'
import { requireRole } from '../../lib/rbac'
import { getOperatorAudit, type AuditCategory } from './audit.service'

export const auditPlugin = new Elysia({ name: 'audit' })
  .use(requireRole('admin'))
  .get(
    '/api/audit',
    ({ query }) =>
      getOperatorAudit({
        inicio:     query.inicio ?? null,
        fim:        query.fim ?? null,
        operatorId: query.operatorId ?? null,
        category:   (query.category as AuditCategory | undefined) ?? null,
      }),
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
