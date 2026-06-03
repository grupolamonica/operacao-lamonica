import { Elysia } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getTorreKpis } from './torre.service'

export const torrePlugin = new Elysia({ name: 'torre' })
  .use(authGuard)
  .group('/api/torre', (app) =>
    app.get('/kpis', () => getTorreKpis(), { detail: { tags: ['torre'], summary: 'KPITorre with 30s Redis cache' } })
  )
