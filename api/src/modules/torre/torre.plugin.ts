import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getTorreKpis, type PeriodoTorre } from './torre.service'

export const torrePlugin = new Elysia({ name: 'torre' })
  .use(authGuard)
  .group('/api/torre', (app) =>
    app.get('/kpis', ({ query }) => getTorreKpis((query.periodo ?? 'tudo') as PeriodoTorre), {
      query: t.Object({ periodo: t.Optional(t.Union([t.Literal('hoje'), t.Literal('7d'), t.Literal('30d'), t.Literal('90d'), t.Literal('tudo')])) }),
      detail: { tags: ['torre'], summary: 'KPITorre with 30s Redis cache — filtro periodo' },
    })
  )
