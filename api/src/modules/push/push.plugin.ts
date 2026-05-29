import { Elysia, t } from 'elysia'

import { authGuard } from '../../lib/rbac'
import { getVapidPublicKey, subscribe, unsubscribe } from './push.service'

/**
 * Push notifications plugin — Phase 6, plan 06-04.
 *
 * Endpoints:
 *   GET    /api/push/vapid-public-key   (PUBLIC — VAPID public key is not a secret per RFC 8292)
 *   POST   /api/push/subscribe          (authenticated — body: { endpoint, keys: { p256dh, auth } })
 *   POST   /api/push/unsubscribe        (authenticated — body: { endpoint })
 *
 * Split into two sub-plugins so the public-key endpoint sits outside the auth
 * scope (browser needs the key BEFORE the user authenticates push). Same
 * read/write split idiom used by thresholds.plugin.ts and gps-providers.plugin.ts.
 *
 * SECURITY:
 *   - userId is derived from authGuard JWT, NEVER from the request body
 *     (T-06.04-01 — prevents subscription spoofing).
 *   - Body schemas enforce non-empty strings for all subscription fields.
 *   - Public key endpoint is intentionally unauthenticated; exposing a VAPID
 *     public key is the documented VAPID pattern.
 */

const publicKeyPlugin = new Elysia({ name: 'push-public-key' })
  .get(
    '/api/push/vapid-public-key',
    () => ({ publicKey: getVapidPublicKey() }),
    {
      detail: {
        tags: ['push'],
        summary: 'Get VAPID public key (used as applicationServerKey on the client)',
      },
    },
  )

const authedPlugin = new Elysia({ name: 'push-authed' })
  .use(authGuard)
  .group('/api/push', (app) =>
    app
      .post(
        '/subscribe',
        async ({ body, user, set }) => {
          await subscribe(user.id, body)
          set.status = 201
          return { ok: true }
        },
        {
          body: t.Object({
            endpoint: t.String({ minLength: 1, maxLength: 2000 }),
            keys: t.Object({
              p256dh: t.String({ minLength: 1, maxLength: 200 }),
              auth:   t.String({ minLength: 1, maxLength: 200 }),
            }),
          }),
          detail: {
            tags: ['push'],
            summary: 'Register a Web Push subscription for the current user',
          },
        },
      )
      .post(
        '/unsubscribe',
        async ({ body, user, set }) => {
          await unsubscribe(user.id, body.endpoint)
          set.status = 204
          return ''
        },
        {
          body: t.Object({
            endpoint: t.String({ minLength: 1, maxLength: 2000 }),
          }),
          detail: {
            tags: ['push'],
            summary: 'Remove a Web Push subscription by endpoint',
          },
        },
      ),
  )

export const pushPlugin = new Elysia({ name: 'push' })
  .use(publicKeyPlugin)
  .use(authedPlugin)
