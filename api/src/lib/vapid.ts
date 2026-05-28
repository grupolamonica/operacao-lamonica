/**
 * VAPID key loader for Web Push (lib `web-push`).
 *
 * Reads VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT from env and
 * configures the `web-push` library at module load. If either key is
 * missing, push delivery is disabled (logged at warn level).
 *
 * Generate keys with:
 *   bunx web-push generate-vapid-keys --json
 *
 * Threat coverage:
 *  - T-06.01-05 (spoofing of push endpoint) — private key only loaded from
 *    env, never committed; subject hardcoded as mailto: per RFC 8292.
 *
 * @see CONTEXT D-11 (VAPID self-hosted, zero vendor lock)
 */

import webpush from 'web-push'
import { logger } from './logger'

const publicKey  = process.env.VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY
const subject    = process.env.VAPID_SUBJECT ?? 'mailto:admin@torredecontrole.com'

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey)
  logger.info({ subject }, 'vapid keys configured')
} else {
  logger.warn('VAPID keys missing — push notifications disabled')
}

export const isVapidConfigured = Boolean(publicKey && privateKey)
export const vapidPublicKey: string | undefined = publicKey
