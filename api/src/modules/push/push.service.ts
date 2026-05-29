import webpush from 'web-push'
import { eq } from 'drizzle-orm'

import { db } from '../../db/client'
import { pushSubscriptions } from '../../db/schema/push-subscriptions'
import { logger } from '../../lib/logger'
import { isVapidConfigured, vapidPublicKey } from '../../lib/vapid'

/**
 * Push notifications service — Phase 6, plan 06-04.
 *
 * Functions:
 *   - getVapidPublicKey()        : returns the configured VAPID public key (or null)
 *   - subscribe(userId, input)   : UPSERTs a Web Push subscription, dedupe by endpoint
 *   - unsubscribe(userId, endpt) : removes a subscription by endpoint
 *   - sendToUser(userId, payload): fans out webpush.sendNotification to all user's subs
 *
 * Side effects:
 *   - api/src/lib/vapid.ts already called webpush.setVapidDetails on module load.
 *   - This module only consumes the configured state via isVapidConfigured.
 *
 * Operational decisions (CONTEXT D-11, D-13, D-15, D-16, RESEARCH Pattern 3):
 *   - TTL: 60 — push services drop the message if undelivered within 60 s (LIVE alerts).
 *   - 410/404 cleanup: when a push service reports a dead endpoint we DELETE the row.
 *   - Endpoint URL truncated to 40 chars in logs (T-06.04-08 — endpoint contains auth identifier).
 *
 * SECURITY:
 *   - VAPID private key only consumed inside web-push lib at setVapidDetails(), never logged.
 *   - userId argument is always derived from authGuard JWT — never trusted from request body.
 */

const ENDPOINT_LOG_TRUNCATE = 40

function truncate(endpoint: string): string {
  return endpoint.length <= ENDPOINT_LOG_TRUNCATE
    ? endpoint
    : endpoint.slice(0, ENDPOINT_LOG_TRUNCATE) + '...'
}

/**
 * Returns the configured VAPID public key, or null if push is not configured.
 * The frontend needs this BEFORE calling PushManager.subscribe() because the
 * key is the `applicationServerKey` argument.
 *
 * SECURITY: public key is NOT a secret — exposing it over an unauth endpoint
 * is per VAPID spec (RFC 8292).
 */
export function getVapidPublicKey(): string | null {
  return vapidPublicKey ?? null
}

/**
 * Register a Web Push subscription for a user.
 *
 * Browser returns the same endpoint URL when the same client re-subscribes,
 * so a UNIQUE constraint on `endpoint` + onConflictDoNothing dedupes safely
 * (no upsert needed — keys never change for the same endpoint).
 */
export async function subscribe(
  userId: string,
  input: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dh:   input.keys.p256dh,
      auth:     input.keys.auth,
    })
    .onConflictDoNothing({ target: pushSubscriptions.endpoint })

  logger.info(
    { userId, endpoint: truncate(input.endpoint) },
    'push subscription registered',
  )
}

/**
 * Remove a subscription by its endpoint URL.
 *
 * userId is passed only for logging — the endpoint itself is the unique key.
 * In practice the caller already authenticated via authGuard so userId is trusted.
 */
export async function unsubscribe(userId: string, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
  logger.info({ userId, endpoint: truncate(endpoint) }, 'push subscription removed')
}

/**
 * Send a push notification payload to ALL subscriptions of a given user.
 *
 * Uses Promise.allSettled so a single failed endpoint does NOT abort the rest.
 * 410 Gone / 404 Not Found are treated as expired-subscription signals and the
 * matching row is DELETEd from push_subscriptions automatically.
 *
 * Short-circuits when VAPID is not configured (dev with no env vars) — logs
 * a single warn and returns without iterating.
 */
export async function sendToUser(
  userId: string,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  if (!isVapidConfigured) {
    logger.warn({ userId }, 'sendToUser called but VAPID not configured — skipping')
    return
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))

  if (subs.length === 0) return

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 },
        )
      } catch (e: any) {
        if (e?.statusCode === 410 || e?.statusCode === 404) {
          // Subscription expired or unsubscribed at the push service end.
          // Drop the dead row so we never try again.
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.endpoint, s.endpoint))
          logger.info(
            { endpoint: truncate(s.endpoint), statusCode: e.statusCode },
            'cleaned up expired push subscription',
          )
        } else {
          logger.error(
            {
              error:      e?.message ?? String(e),
              statusCode: e?.statusCode,
              endpoint:   truncate(s.endpoint),
            },
            'push send failed',
          )
        }
      }
    }),
  )
}
