import { asc, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { gpsProviders } from '../../db/schema/gps-providers'

/**
 * GPS Providers service — Phase 6, plan 06-03.
 *
 * Decisions:
 *  - D-20: STUB only. Phase 6 persists config (name + base URL + api key)
 *    but performs no real integration. Future phases will add the runtime
 *    provider client.
 *  - Hard delete allowed (no operational FK chain depending on these rows).
 *  - apiKey is stored in plaintext for Phase 6 — flagged in threat register
 *    (T-06.03-06). The plugin layer masks the value before returning it to
 *    clients, so plaintext stays inside the API boundary.
 */

export type GpsProviderProjection = {
  id:        string
  name:      string
  baseUrl:   string | null
  apiKey:    string | null   // already masked when returned via plugin
  isActive:  boolean
  createdAt: Date
}

/**
 * Mask helper — keep only the last 4 chars of the key prefixed by bullets.
 * Returns null when the key is null/empty (preserves "no key configured"
 * semantics for the UI).
 */
export function maskApiKey(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.length <= 4) return '••••'
  return `••••${value.slice(-4)}`
}

function projectMasked(row: typeof gpsProviders.$inferSelect): GpsProviderProjection {
  return {
    id:        row.id,
    name:      row.name,
    baseUrl:   row.baseUrl,
    apiKey:    maskApiKey(row.apiKey),
    isActive:  row.isActive,
    createdAt: row.createdAt,
  }
}

export async function listGpsProviders(): Promise<GpsProviderProjection[]> {
  const rows = await db.select().from(gpsProviders).orderBy(asc(gpsProviders.name))
  return rows.map(projectMasked)
}

export async function getGpsProvider(id: string): Promise<GpsProviderProjection | null> {
  const [row] = await db.select().from(gpsProviders).where(eq(gpsProviders.id, id)).limit(1)
  return row ? projectMasked(row) : null
}

export async function createGpsProvider(input: {
  name:     string
  baseUrl?: string
  apiKey?:  string
  isActive?: boolean
}): Promise<GpsProviderProjection> {
  const [row] = await db
    .insert(gpsProviders)
    .values({
      name:     input.name,
      baseUrl:  input.baseUrl ?? null,
      apiKey:   input.apiKey  ?? null,
      isActive: input.isActive ?? true,
    })
    .returning()
  return projectMasked(row!)
}

export async function updateGpsProvider(
  id: string,
  patch: {
    name?:     string
    baseUrl?:  string | null
    apiKey?:   string | null
    isActive?: boolean
  },
): Promise<GpsProviderProjection | null> {
  const updates: Record<string, unknown> = {}
  if (patch.name     !== undefined) updates.name     = patch.name
  if (patch.baseUrl  !== undefined) updates.baseUrl  = patch.baseUrl
  if (patch.apiKey   !== undefined) updates.apiKey   = patch.apiKey
  if (patch.isActive !== undefined) updates.isActive = patch.isActive

  if (Object.keys(updates).length === 0) return getGpsProvider(id)

  const [row] = await db
    .update(gpsProviders)
    .set(updates)
    .where(eq(gpsProviders.id, id))
    .returning()
  return row ? projectMasked(row) : null
}

export async function deleteGpsProvider(id: string): Promise<boolean> {
  const result = await db.delete(gpsProviders).where(eq(gpsProviders.id, id)).returning()
  return result.length > 0
}
