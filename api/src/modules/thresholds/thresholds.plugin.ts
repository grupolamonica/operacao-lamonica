import { Elysia, t } from 'elysia'
import { authGuard, requireRole } from '../../lib/rbac'
import { getThresholds, updateThreshold } from './thresholds.service'

/**
 * Thresholds plugin — Phase 6, plan 06-03.
 *
 * Endpoints:
 *   GET   /api/thresholds         (any authenticated user — read)
 *   PATCH /api/thresholds/:type   (admin only — upsert single value)
 *
 * Split into two sub-plugins: read scope uses authGuard, write scope uses
 * requireRole('admin'). Combining them in a single Elysia chain with a
 * mid-chain `.use(requireRole(...))` would force the GET endpoint to also
 * require admin — that's the inverse of the intended ACL.
 */
const readPlugin = new Elysia({ name: 'thresholds-read' })
  .use(authGuard)
  .get('/api/thresholds', () => getThresholds(), {
    detail: {
      tags: ['thresholds'],
      summary: 'Get current alert thresholds (in-memory cache, 60 s TTL)',
    },
  })

const writePlugin = new Elysia({ name: 'thresholds-write' })
  .use(authGuard)
  .use(requireRole('admin'))
  .group('/api/thresholds', (app) =>
    app.patch(
      '/:type',
      async ({ params, body, user, set }) => {
        await updateThreshold(params.type, body.value, user.id)
        set.status = 204
        return ''
      },
      {
        params: t.Object({
          type: t.String({ minLength: 1, maxLength: 50 }),
        }),
        body: t.Object({
          value: t.Integer({ minimum: 0, maximum: 10_000 }),
        }),
        detail: {
          tags: ['thresholds'],
          summary: 'Upsert alert threshold (admin) — invalidates cache',
        },
      },
    ),
  )

export const thresholdsPlugin = new Elysia({ name: 'thresholds' })
  .use(readPlugin)
  .use(writePlugin)
