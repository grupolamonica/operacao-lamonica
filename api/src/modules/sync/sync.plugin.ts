import { Elysia } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { syncMonitoring } from '../../adapters/angellira/monitoring.adapter'

/** Gatilho manual de sincronização do monitoramento Angellira ao vivo (Phase 12). */
export const syncPlugin = new Elysia({ name: 'sync' })
  .use(authGuard)
  .group('/api/sync', (app) =>
    app
      .post('/monitoramento', () => syncMonitoring(), {
        detail: { tags: ['sync'], summary: 'Sync manual do monitoramento Angellira (viagens ao vivo)' },
      })
      // alias retrocompat
      .post('/carrega', () => syncMonitoring(), {
        detail: { tags: ['sync'], summary: 'Alias de /monitoramento' },
      }),
  )
