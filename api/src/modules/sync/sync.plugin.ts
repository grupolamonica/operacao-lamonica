import { Elysia } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { syncCarrega } from '../../adapters/sheets/carrega.adapter'

/** Gatilho manual de sincronização de planilhas (Phase 12). */
export const syncPlugin = new Elysia({ name: 'sync' })
  .use(authGuard)
  .group('/api/sync', (app) =>
    app.post('/carrega', () => syncCarrega(), {
      detail: { tags: ['sync'], summary: 'Sync manual da aba Carrega (monitoramento GRIFFI)' },
    }),
  )
