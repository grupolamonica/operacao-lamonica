import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getDashboardKpis } from './dashboard.service'

export const dashboardPlugin = new Elysia({ name: 'dashboard' })
  .use(authGuard)
  .group('/api/dashboard', (app) =>
    app.get('/kpis', ({ query }) => getDashboardKpis({ inicio: query.inicio, fim: query.fim }), {
      query: t.Object({ inicio: t.Optional(t.String()), fim: t.Optional(t.String()) }),
      detail: { tags: ['dashboard'], summary: 'KPIDashboard (paridade painel) — filtro Prazo Final inicio/fim, cache 30s' },
    })
  )
