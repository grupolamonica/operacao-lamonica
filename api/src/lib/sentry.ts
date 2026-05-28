/**
 * Sentry SDK initialization for the Bun/Node backend.
 *
 * Side-effect module per CONTEXT D-38: import it for its boot effect; no
 * exports are needed at runtime. If SENTRY_DSN is unset (e.g. in dev), the
 * module no-ops — Sentry is opt-in.
 *
 * NOTE: This is a SCAFFOLD-ONLY file for Wave 0. The actual import wiring in
 * api/src/index.ts is deferred to plans 06-04 and 06-07.
 *
 * Threat coverage:
 *  - T-06.01-01 (information disclosure to Sentry service) — beforeSend
 *    runs scrubRecursive on every event to strip PII / JWT / geo / contact.
 *
 * @see ./scrub.ts for SCRUB_KEYS + recursion impl
 * @see CONTEXT D-38 / D-39 / D-40 (sample rate 0.1, no Session Replay)
 */

import * as Sentry from '@sentry/node'
import { scrubRecursive } from './scrub'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn:               process.env.SENTRY_DSN,
    environment:       process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate:  0.1,
    beforeSend(event) {
      return scrubRecursive(event) as Sentry.ErrorEvent
    },
  })
}
