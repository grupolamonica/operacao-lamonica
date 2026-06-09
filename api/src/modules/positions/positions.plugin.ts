/**
 * positions.plugin.ts — Phase 11 (D-11-02)
 *
 * GET /api/positions — última posição geocodada por motorista (frota importada),
 * enriquecida com ranking (join cross-source, D-11-03).
 *
 * authGuard aplicado UMA vez no nível do plugin (padrão ranking.plugin).
 * GET sem body — não sofre o bug Elysia 1.4.28 (só POST/body em plugin).
 * Sem rota de escrita (read-only, T-11-01).
 *
 * Erros do service (ex.: RANK_* envs ausentes, fetch failure) propagam
 * para o onError global em index.ts — nunca vaza credencial (T-11-02).
 */

import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getFleetPositions, getDriverTrack } from './positions.service'

export const positionsReadPlugin = new Elysia({ name: 'positions-read' })
  .use(authGuard)
  .group('/api/positions', (app) =>
    app
      .get('/', () => getFleetPositions(), {
        detail: {
          tags: ['positions'],
          summary: 'Última posição geocodada por motorista (frota importada) enriquecida com ranking',
        },
      })
      // Phase 14 — trajeto histórico de um motorista (rota no mapa da tela de Viagens)
      .get('/track', ({ query }) => getDriverTrack(query.motorista), {
        query: t.Object({ motorista: t.String() }),
        detail: {
          tags: ['positions'],
          summary: 'Trajeto histórico (lat/lng ordenado) de um motorista para traçar a rota',
        },
      })
  )
