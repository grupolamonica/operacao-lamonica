import { Elysia } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getDashboardKpis } from './dashboard.service'

export const dashboardPlugin = new Elysia({ name: 'dashboard' })
  .use(authGuard)
  .group('/api/dashboard', (app) =>
    app.get('/kpis', () => getDashboardKpis(), { detail: { tags: ['dashboard'], summary: 'KPIDashboard with 30s Redis cache' } })
  )
