/**
 * Sentry SDK initialization for the React frontend.
 *
 * Call `initSentry()` from `main.tsx` BEFORE `createRoot()` so React error
 * boundaries are wired before the app mounts. If VITE_SENTRY_DSN is unset
 * the function early-returns and Sentry stays disabled (no-op).
 *
 * Threat coverage:
 *  - T-06.01-02 (information disclosure to Sentry from browser context)
 *
 * @see ./scrub.ts for SCRUB_KEYS + recursion impl
 * @see CONTEXT D-38 / D-40 (no Session Replay → samples set to 0)
 */

import * as Sentry from '@sentry/react'
import { scrubRecursive } from './scrub'

export function initSentry(): void {
  if (!import.meta.env.VITE_SENTRY_DSN) return

  Sentry.init({
    dsn:                      import.meta.env.VITE_SENTRY_DSN as string,
    environment:              import.meta.env.MODE,
    tracesSampleRate:         0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      return scrubRecursive(event) as Sentry.ErrorEvent
    },
  })
}
