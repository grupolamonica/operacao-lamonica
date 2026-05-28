import { db } from '../../db/client'
import { alertThresholds } from '../../db/schema/alert-thresholds'

/**
 * Alert thresholds service — Phase 6, plan 06-03.
 *
 * Decisions:
 *  - D-19: thresholds are key-value rows (type=PK, value=integer).
 *  - Admin-only write enforced at the plugin layer via requireRole('admin').
 *  - Read is cached in-memory for 60 s (chosen over Redis per RESEARCH
 *    Pattern Map — alert engine hits these every position update, and a
 *    process-local cache avoids a Redis round-trip on the hot path).
 *  - updateThreshold INVALIDATES cache immediately so the next reader sees
 *    fresh values (no stale window).
 *
 * Threat model coverage:
 *  - T-06.03-07: stale cache after write → invalidateThresholdsCache() runs
 *    inside updateThreshold so cache cannot outlive the write.
 *  - T-06.03-08: TTL bug — TTL_MS is a constant; cacheExpiry compared via
 *    Date.now() (monotonic at 60 s granularity).
 */

type ThresholdMap = Record<string, number>

let cache: ThresholdMap | null = null
let cacheExpiry = 0
const TTL_MS = 60_000  // 60 seconds (CONTEXT D-19)

/**
 * Reads all thresholds. Serves from process-local cache when fresh; falls
 * back to a single SELECT on miss. Cache is keyed by `type` → `value`.
 */
export async function getThresholds(): Promise<ThresholdMap> {
  if (cache && Date.now() < cacheExpiry) return cache

  const rows = await db.select().from(alertThresholds)
  cache = Object.fromEntries(rows.map((r) => [r.type, r.value]))
  cacheExpiry = Date.now() + TTL_MS
  return cache
}

/**
 * Drops the in-memory cache. Exported for explicit invalidation from other
 * modules if they ever bulk-update thresholds outside this service.
 */
export function invalidateThresholdsCache(): void {
  cache = null
  cacheExpiry = 0
}

/**
 * Upsert a single threshold. Uses ON CONFLICT (type) DO UPDATE so callers
 * can blindly set without a prior existence check.
 *
 * `updatedBy` MUST be a UUID present in `users.id` (FK enforced by schema).
 * Invalidates cache so subsequent getThresholds() reads observe new value.
 */
export async function updateThreshold(
  type: string,
  value: number,
  updatedBy: string,
): Promise<void> {
  await db
    .insert(alertThresholds)
    .values({ type, value, updatedBy })
    .onConflictDoUpdate({
      target: alertThresholds.type,
      set:    { value, updatedBy, updatedAt: new Date() },
    })
  invalidateThresholdsCache()
}
