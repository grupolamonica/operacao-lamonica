/**
 * Recursive PII / secret scrubber for Sentry beforeSend events.
 *
 * Used by both backend (@sentry/node) and frontend (@sentry/react) to remove
 * sensitive fields (passwords, tokens, geo coords, contact info) before any
 * event is sent to the Sentry ingestion endpoint.
 *
 * Threat coverage:
 *  - T-06.01-01 (information disclosure backend)
 *  - LGPD-friendly: scrubs email/phone/lat/lng/address by default
 *  - ASVS V7.3.4 (log sanitization)
 */

export const SCRUB_KEYS = [
  'password', 'passwordhash', 'authorization', 'cookie', 'cookies',
  'email', 'phone', 'lat', 'lng', 'latitude', 'longitude', 'address',
  'token', 'jwt', 'access_token', 'refresh_token',
] as const

const MAX_DEPTH = 8

function isScrubKey(key: string): boolean {
  const k = key.toLowerCase()
  return SCRUB_KEYS.some((s) => k === s || k.includes(s))
}

export function scrubRecursive(obj: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '<max-depth>'
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') {
    if (typeof obj === 'string' && /Bearer\s+\S+/i.test(obj)) return '<scrubbed-bearer>'
    return obj
  }
  if (Array.isArray(obj)) return obj.map((v) => scrubRecursive(v, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (isScrubKey(k)) {
      out[k] = '<scrubbed>'
    } else if (typeof v === 'string' && /Bearer\s+\S+/i.test(v)) {
      out[k] = '<scrubbed-bearer>'
    } else {
      out[k] = scrubRecursive(v, depth + 1)
    }
  }
  return out
}
