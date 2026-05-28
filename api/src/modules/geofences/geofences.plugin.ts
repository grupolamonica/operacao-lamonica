import { Elysia, t } from 'elysia'
import { eq, sql, desc } from 'drizzle-orm'
import { authGuard } from '../../lib/rbac'
import { db } from '../../db/client'
import { geofences, geofenceEvents } from '../../db/schema/geofences'
import { redis } from '../../redis/client'
import { logger } from '../../lib/logger'

const GEOFENCE_ALERT_CHANNEL = 'alerts:new'

// Convert GeoJSON polygon to PostGIS geometry for spatial queries
function geoJsonToWkt(coordinates: number[][][]): string {
  const ring = coordinates[0]!.map(([lng, lat]) => `${lng} ${lat}`).join(',')
  return `POLYGON((${ring}))`
}

// Check if a point is inside any geofence using PostGIS
async function checkPointInGeofences(lat: number, lng: number, vehicleId: string, tripId: string | null) {
  const point = `POINT(${lng} ${lat})`

  const results = await db.execute(sql`
    SELECT id, name, type, color
    FROM geofences
    WHERE is_active = true
      AND geom IS NOT NULL
      AND ST_Contains(geom, ST_GeomFromText(${point}, 4326))
  `) as { id: string; name: string; type: string; color: string }[]

  for (const fence of (results as any[]).filter(Boolean)) {
    if (!fence?.id) continue

    // Check for duplicate event in last 5 minutes (debounce)
    const recentEvent = await db.execute(sql`
      SELECT id FROM geofence_events
      WHERE geofence_id = ${fence.id}
        AND vehicle_id = ${vehicleId}
        AND event_type = 'entry'
        AND occurred_at > NOW() - INTERVAL '5 minutes'
      LIMIT 1
    `)

    if ((recentEvent as any[]).length > 0) continue

    // Record entry event
    await db.insert(geofenceEvents).values({
      geofenceId: fence.id,
      vehicleId,
      tripId:    tripId ?? undefined,
      eventType: 'entry',
      lat:       String(lat),
      lng:       String(lng),
    })

    // Broadcast alert for restricted zones
    if (fence.type === 'zona_restrita' || fence.type === 'zona_perigo') {
      await redis.publish(GEOFENCE_ALERT_CHANNEL, JSON.stringify({
        type:      'alert:new',
        severity:  fence.type === 'zona_perigo' ? 'critico' : 'medio',
        alertType: 'entrou_geofence',
        vehicleId,
        tripId,
        title:     `Entrada em zona — ${fence.name}`,
      }))
    }

    logger.info({ geofenceId: fence.id, vehicleId, fenceName: fence.name }, 'geofence entry')
  }
}

export function registerGeofenceCheck(vehicleId: string, lat: number, lng: number, tripId: string | null) {
  checkPointInGeofences(lat, lng, vehicleId, tripId).catch(e =>
    logger.error({ error: e.message }, 'geofence check failed')
  )
}

export const geofencesPlugin = new Elysia({ name: 'geofences' })
  .use(authGuard)
  .group('/api/geofences', (app) =>
    app
      .get('/', async () => {
        return db.select().from(geofences).orderBy(desc(geofences.createdAt))
      }, { detail: { tags: ['geofences'], summary: 'List all geofences' } })

      .get('/:id', async ({ params, set }) => {
        const [fence] = await db.select().from(geofences).where(eq(geofences.id, params.id))
        if (!fence) { set.status = 404; return { error: 'Geofence not found' } }
        return fence
      }, { params: t.Object({ id: t.String() }) })

      .post('/', async ({ body }) => {
        const [fence] = await db.insert(geofences).values({
          name:        body.name,
          type:        body.type ?? 'zona_restrita',
          color:       body.color ?? '#ef4444',
          coordinates: body.coordinates,
          description: body.description,
        }).returning()

        // Update PostGIS geometry column
        const wkt = geoJsonToWkt(body.coordinates as number[][][])
        await db.execute(sql`
          UPDATE geofences
          SET geom = ST_GeomFromText(${wkt}, 4326)
          WHERE id = ${fence.id}
        `)

        return fence
      }, {
        body: t.Object({
          name:        t.String({ minLength: 1 }),
          type:        t.Optional(t.Union([
            t.Literal('zona_restrita'), t.Literal('zona_perigo'),
            t.Literal('zona_operacao'), t.Literal('checkpoint'),
          ])),
          color:       t.Optional(t.String()),
          coordinates: t.Any(), // GeoJSON Polygon coordinates
          description: t.Optional(t.String()),
        }),
        detail: { tags: ['geofences'], summary: 'Create geofence' },
      })

      .patch('/:id', async ({ params, body, set }) => {
        const updates: Record<string, unknown> = { updatedAt: new Date() }
        if (body.name)        updates.name = body.name
        if (body.type)        updates.type = body.type
        if (body.color)       updates.color = body.color
        if (body.description) updates.description = body.description
        if (body.isActive !== undefined) updates.isActive = body.isActive
        if (body.coordinates) {
          updates.coordinates = body.coordinates
        }

        const [fence] = await db.update(geofences).set(updates as any).where(eq(geofences.id, params.id)).returning()
        if (!fence) { set.status = 404; return { error: 'Not found' } }

        if (body.coordinates) {
          const wkt = geoJsonToWkt(body.coordinates as number[][][])
          await db.execute(sql`UPDATE geofences SET geom = ST_GeomFromText(${wkt}, 4326) WHERE id = ${fence.id}`)
        }

        return fence
      }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          name:        t.Optional(t.String()),
          type:        t.Optional(t.String()),
          color:       t.Optional(t.String()),
          coordinates: t.Optional(t.Any()),
          description: t.Optional(t.String()),
          isActive:    t.Optional(t.Boolean()),
        }),
      })

      .delete('/:id', async ({ params, set }) => {
        const result = await db.delete(geofences).where(eq(geofences.id, params.id))
        if (!result) { set.status = 404; return { error: 'Not found' } }
        set.status = 204
        return ''
      }, { params: t.Object({ id: t.String() }) })

      .get('/:id/events', async ({ params }) => {
        return db.select().from(geofenceEvents)
          .where(eq(geofenceEvents.geofenceId, params.id))
          .orderBy(desc(geofenceEvents.occurredAt))
          .limit(100)
      }, {
        params: t.Object({ id: t.String() }),
        detail: { tags: ['geofences'], summary: 'Geofence entry/exit events' },
      })
  )
