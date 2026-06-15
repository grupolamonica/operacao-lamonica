import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getDashboardKpis, type PeriodoSla } from './dashboard.service'

export const dashboardPlugin = new Elysia({ name: 'dashboard' })
  .use(authGuard)
  .group('/api/dashboard', (app) =>
    app.get('/kpis', ({ query }) => getDashboardKpis((query.periodo ?? '30d') as PeriodoSla), {
      query: t.Object({ periodo: t.Optional(t.Union([t.Literal('hoje'), t.Literal('7d'), t.Literal('30d'), t.Literal('90d'), t.Literal('tudo')])) }),
      detail: { tags: ['dashboard'], summary: 'KPIDashboard (paridade painel) — filtro periodo, cache 30s' },
    })
  )
