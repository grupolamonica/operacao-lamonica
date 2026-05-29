import { sql } from 'drizzle-orm'

import { db } from '../../db/client'
import { logger } from '../../lib/logger'
import { sendToUser } from './push.service'

/**
 * Alert push dispatcher — Phase 6, plan 06-04.
 *
 * Called by the alert engine (api/src/jobs/alert-inline.ts) after a new alert
 * row is inserted and broadcast via Redis. Fans out a push notification to
 * every active user whose notification_preferences opt-in for the alert's
 * severity.
 *
 * Operational guarantees:
 *   - NEVER throws. All errors are caught, logged, and swallowed so the alert
 *     pipeline is never blocked by a flaky push service (T-06.04-03).
 *   - Filter is `is_active = true AND notification_preferences->>severity = 'true'`.
 *     The JSONB ->> operator returns text, which we compare against the string
 *     literal 'true' (matches Postgres jsonb_typeof = 'boolean' canonical form).
 *
 * SECURITY:
 *   - severity is constrained at the TypeScript level to the alert severity
 *     literal union, AND interpolated via Drizzle's parameterized `sql` tag
 *     (T-06.04-06 — no SQL injection risk).
 *   - Alert title/description sent in the payload may contain operational PII
 *     (driver name, route code); accepted per T-06.04-04 — operators need
 *     actionable info, transport is HTTPS via push services.
 */

export type AlertPushPayload = {
  id:          string
  title:       string
  description: string
  severity:    'critico' | 'medio' | 'baixo'
}

export async function dispatchAlertPush(alert: AlertPushPayload): Promise<void> {
  try {
    // notification_preferences is JSONB; ->> returns text (boolean serialized as 'true'/'false').
    const rows = (await db.execute(sql`
      SELECT id FROM users
      WHERE is_active = true
        AND notification_preferences->>${alert.severity} = 'true'
    `)) as unknown as Array<{ id: string }>

    if (rows.length === 0) return

    await Promise.allSettled(
      rows.map((u) =>
        sendToUser(u.id, {
          title: `⚠ ${alert.title}`,
          body:  alert.description ?? '',
          url:   `/alertas/${alert.id}`,
        }),
      ),
    )

    logger.info(
      {
        alertId:        alert.id,
        severity:       alert.severity,
        recipientCount: rows.length,
      },
      'alert push dispatched',
    )
  } catch (e: any) {
    // Fire-and-forget: any failure here is logged but never bubbles up to the
    // alert engine. The alert is already persisted at this point.
    logger.error(
      { error: e?.message ?? String(e), alertId: alert.id },
      'dispatchAlertPush failed',
    )
  }
}
