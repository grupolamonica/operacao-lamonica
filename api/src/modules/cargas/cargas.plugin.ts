/**
 * Cargas HTTP plugin (Phase 14) — endpoints atrás do `authGuard` da Torre.
 *
 *   GET  /api/cargas/open-loads               → OpenLoad[] (cargas sem motorista)
 *   GET  /api/cargas/open-loads/:id/candidates → LoadCandidate[] (leads QUEUED)
 *   POST /api/cargas/open-loads/:id/allocate   → aloca/reserva no Cargas (GATED)
 *
 * D-14-01: leitura proxyada do Supabase de Cargas (server-side). D-14-05/06: a
 * escrita só executa com CARGAS_WRITE_ENABLED=true; senão retorna 501 e a UI
 * mostra o botão desabilitado. Erros propagam pro onError global (não vazam key).
 */

import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getOpenLoads, getLoadCandidates } from './cargas.service'
import { allocateLoad, isCargasWriteEnabled } from './cargas.write'
import { syncCargas } from './cargas.sync'

const allocateSchema = t.Object({
  leadId: t.Optional(t.String()),
  cpf: t.Optional(t.String()),
  phone: t.Optional(t.String()),
  horsePlate: t.Optional(t.String()),
  trailerPlate: t.Optional(t.String()),
  trailerPlate2: t.Optional(t.String()),
  vehicleType: t.Optional(t.String()),
})

export const cargasPlugin = new Elysia({ name: 'cargas' })
  .use(authGuard)
  .group('/api/cargas', (app) =>
    app
      .get('/open-loads', () => getOpenLoads(), {
        detail: {
          tags: ['cargas'],
          summary: 'Cargas em aberto (status OPEN, sem motorista) + contagem de candidatos',
        },
      })
      .get('/open-loads/:id/candidates', ({ params }) => getLoadCandidates(params.id), {
        detail: {
          tags: ['cargas'],
          summary: 'Candidatos (leads QUEUED) de uma carga, com nome cruzado por CPF',
        },
      })
      .post(
        '/open-loads/:id/allocate',
        async ({ params, body, set }) => {
          if (!isCargasWriteEnabled()) {
            set.status = 501
            return { error: 'CARGAS_WRITE_ENABLED is false — alocação desabilitada' }
          }
          return allocateLoad(params.id, body)
        },
        {
          body: allocateSchema,
          detail: {
            tags: ['cargas'],
            summary: 'Aloca motorista na carga (approve lead OU direct-allocation). GATED por CARGAS_WRITE_ENABLED.',
          },
        },
      )
      .post(
        '/sync',
        async ({ user, set }) => {
          if (user.role !== 'admin' && user.role !== 'supervisor') {
            set.status = 403
            return { error: 'Forbidden: requires admin|supervisor' }
          }
          return syncCargas()
        },
        {
          detail: {
            tags: ['cargas'],
            summary: 'Sync manual: materializa cargas abertas + candidatos e enriquece trips.cargas_status por LH',
          },
        },
      ),
  )
