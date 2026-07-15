/**
 * GR (Gerenciamento de Risco) HTTP plugin — endpoints atrás do authGuard.
 *   GET  /api/gr/overview  → KPIs (veredito + alertas + última sync)
 *   GET  /api/gr/drivers   → motoristas + veredito consolidado
 *   GET  /api/gr/vehicles  → veículos + vigência Angellira por placa
 *   POST /api/gr/sync      → materializa gr_vigencias do Cargas (admin|supervisor)
 *
 * Módulo 'gr' (NÃO 'risk' — modules/risk é risco de ENTREGA). O dado de risco
 * cadastral vem do Cargas via gr.reads/gr.sync. Registrar ANTES do wsPlugin.
 */
import { Elysia } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getGrOverview, getGrDrivers, getGrVehicles } from './gr.service'
import { syncGr } from './gr.sync'

export const grPlugin = new Elysia({ name: 'gr' })
  .use(authGuard)
  .group('/api/gr', (app) =>
    app
      .get('/overview', () => getGrOverview(), {
        detail: { tags: ['gr'], summary: 'KPIs de risco: veredito (motorista/veículo) + alertas + última sync' },
      })
      .get('/drivers', () => getGrDrivers(), {
        detail: { tags: ['gr'], summary: 'Motoristas + veredito consolidado (Angellira/BRK/SPX) + status por provider' },
      })
      .get('/vehicles', () => getGrVehicles(), {
        detail: { tags: ['gr'], summary: 'Veículos + vigência Angellira por placa' },
      })
      .post(
        '/sync',
        async ({ user, set }) => {
          if (user.role !== 'admin' && user.role !== 'supervisor') {
            set.status = 403
            return { error: 'Forbidden: requires admin|supervisor' }
          }
          return syncGr()
        },
        {
          detail: {
            tags: ['gr'],
            summary: 'Sync manual: materializa gr_vigencias a partir do Cargas (driver_profiles + vehicles)',
          },
        },
      ),
  )
