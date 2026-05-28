import { Elysia, t } from 'elysia'
import { authGuard, requireRole } from '../../lib/rbac'
import {
  createGpsProvider,
  deleteGpsProvider,
  getGpsProvider,
  listGpsProviders,
  updateGpsProvider,
} from './gps-providers.service'

/**
 * GPS Providers plugin — Phase 6, plan 06-03.
 *
 * Endpoints:
 *   GET    /api/gps-providers        (any authenticated — list, apiKey masked)
 *   GET    /api/gps-providers/:id    (any authenticated — get one, apiKey masked)
 *   POST   /api/gps-providers        (admin only — create)
 *   PATCH  /api/gps-providers/:id    (admin only — update)
 *   DELETE /api/gps-providers/:id    (admin only — hard delete; OK per D-20 stub)
 *
 * SECURITY:
 *   - apiKey is masked (••••last4) on every response (T-06.03-06).
 *   - Writes gated by requireRole('admin').
 *
 * Same two-sub-plugin pattern as users/thresholds: read scope with authGuard,
 * write scope with requireRole('admin'), combined under one exported plugin.
 */
const readPlugin = new Elysia({ name: 'gps-providers-read' })
  .use(authGuard)
  .get('/api/gps-providers', () => listGpsProviders(), {
    detail: {
      tags: ['gps-providers'],
      summary: 'List GPS provider configs (apiKey masked)',
    },
  })
  .get(
    '/api/gps-providers/:id',
    async ({ params, set }) => {
      const p = await getGpsProvider(params.id)
      if (!p) {
        set.status = 404
        return { error: 'Provider not found' }
      }
      return p
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      detail: {
        tags: ['gps-providers'],
        summary: 'Get one GPS provider (apiKey masked)',
      },
    },
  )

const writePlugin = new Elysia({ name: 'gps-providers-write' })
  .use(requireRole('admin'))
  .group('/api/gps-providers', (app) =>
    app
      .post(
        '/',
        async ({ body }) => createGpsProvider(body),
        {
          body: t.Object({
            name:     t.String({ minLength: 1, maxLength: 100 }),
            baseUrl:  t.Optional(t.String({ maxLength: 500 })),
            apiKey:   t.Optional(t.String({ maxLength: 500 })),
            isActive: t.Optional(t.Boolean()),
          }),
          detail: {
            tags: ['gps-providers'],
            summary: 'Create GPS provider config (admin)',
          },
        },
      )

      .patch(
        '/:id',
        async ({ params, body, set }) => {
          const r = await updateGpsProvider(params.id, body)
          if (!r) {
            set.status = 404
            return { error: 'Provider not found' }
          }
          return r
        },
        {
          params: t.Object({ id: t.String({ format: 'uuid' }) }),
          body: t.Object({
            name:     t.Optional(t.String({ minLength: 1, maxLength: 100 })),
            baseUrl:  t.Optional(t.String({ maxLength: 500 })),
            apiKey:   t.Optional(t.String({ maxLength: 500 })),
            isActive: t.Optional(t.Boolean()),
          }),
          detail: {
            tags: ['gps-providers'],
            summary: 'Update GPS provider config (admin)',
          },
        },
      )

      .delete(
        '/:id',
        async ({ params, set }) => {
          const ok = await deleteGpsProvider(params.id)
          if (!ok) {
            set.status = 404
            return { error: 'Provider not found' }
          }
          set.status = 204
          return ''
        },
        {
          params: t.Object({ id: t.String({ format: 'uuid' }) }),
          detail: {
            tags: ['gps-providers'],
            summary: 'Delete GPS provider config (admin, hard delete)',
          },
        },
      ),
  )

export const gpsProvidersPlugin = new Elysia({ name: 'gps-providers' })
  .use(readPlugin)
  .use(writePlugin)
