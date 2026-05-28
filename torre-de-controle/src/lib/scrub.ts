/**
 * Recursive PII / secret scrubber for Sentry beforeSend events (frontend).
 *
 * Mirror of api/src/lib/scrub.ts — kept identical so both ends scrub the
 * same key set. No Node-only imports.
 *
 * Threat coverage:
 *  - T-06.01-02 (information disclosure frontend)
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
