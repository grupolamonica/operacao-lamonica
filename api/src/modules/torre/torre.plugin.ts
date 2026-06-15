import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getTorreKpis } from './torre.service'

export const torrePlugin = new Elysia({ name: 'torre' })
  .use(authGuard)
  .group('/api/torre', (app) =>
    app.get('/kpis', ({ query }) => getTorreKpis({ inicio: query.inicio, fim: query.fim }), {
      query: t.Object({ inicio: t.Optional(t.String()), fim: t.Optional(t.String()) }),
      detail: { tags: ['torre'], summary: 'KPITorre with 30s Redis cache — filtro Prazo Final (inicio/fim)' },
    })
  )
