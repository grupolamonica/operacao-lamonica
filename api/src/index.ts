// Sentry MUST be imported BEFORE Elysia and any business module so its
// async-hook instrumentation can wrap request handlers from the start.
// The lib/sentry.ts module is a side-effect — Sentry.init runs at load if
// SENTRY_DSN is set, no-ops otherwise (CONTEXT D-38).
import './lib/sentry'

import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { eq, and } from 'drizzle-orm'
import * as jose from 'jose'

import { logger } from './lib/logger'
import { db } from './db/client'
import { redis } from './redis/client'
import { vehicles } from './db/schema/vehicles'
import { drivers } from './db/schema/drivers'
import { trips } from './db/schema/trips'
import { authPlugin } from './modules/auth/auth.plugin'
import { tripsPlugin } from './modules/trips/trips.plugin'
import { driversPlugin } from './modules/drivers/drivers.plugin'
import { alertsPlugin } from './modules/alerts/alerts.plugin'
import { vehiclesPlugin } from './modules/vehicles/vehicles.plugin'
import { dashboardPlugin } from './modules/dashboard/dashboard.plugin'
import { wsPlugin } from './modules/ws/ws.plugin'
// Phase 6 modules (plans 06-02, 06-03, 06-04)
import { insightsPlugin } from './modules/insights/insights.plugin'
import { exportsPlugin } from './modules/exports/exports.plugin'
import { pushPlugin } from './modules/push/push.plugin'
import { usersPlugin } from './modules/users/users.plugin'
import { thresholdsPlugin } from './modules/thresholds/thresholds.plugin'
import { gpsProvidersPlugin } from './modules/gps-providers/gps-providers.plugin'
// Phase 7 — ranking (read-only proxy to ride-rank Supabase + Sheets)
import { rankingPlugin } from './modules/ranking/ranking.plugin'
// Phase 9 — ranking write endpoints (evaluations, blocks, unblock) behind requireRole
import { rankingWritePlugin } from './modules/ranking/ranking.write.plugin'
// Phase 11 — positions read (GET /api/positions, authGuard, enriquecido c/ ranking)
import { positionsReadPlugin } from './modules/positions/positions.plugin'
// Sprint 4 — SLA rules engine + dashboard
import { slaPlugin } from './modules/sla/sla.plugin'
// Sprint 7 — Central de comunicações
import { communicationsPlugin } from './modules/communications/communications.plugin'
// Sprint 8 — BI Executivo
import { biPlugin } from './modules/bi/bi.plugin'
// Sprint 9 — Módulo de Previsão
import { forecastPlugin } from './modules/forecast/forecast.plugin'
// Phase 12 — KPIs da Torre de Controle (D-12-34)
import { torrePlugin } from './modules/torre/torre.plugin'
// Phase 12 — presença de operadores (Fila de Operadores online)
import { operatorsPlugin } from './modules/operators/operators.plugin'
// Phase 12 — sync do monitoramento Angellira ao vivo (gatilho manual)
import { syncPlugin } from './modules/sync/sync.plugin'
// Phase 12 — jobs Angellira (posições ao vivo + detectores de ocorrência)
import { startAngelliraJobs } from './jobs/angellira-cron'
import { processAlertDetection } from './jobs/alert-inline'
import { sql, desc } from 'drizzle-orm'
import { geofences, geofenceEvents } from './db/schema/geofences'
// Phase 10 — positions import
import { driverPositions } from './db/schema/driver-positions'
import { parseViagensXlsx } from './modules/positions/viagens.parser'
import { geocodeText } from './modules/positions/geocoder'

const PORT = Number(process.env.PORT ?? 3000)
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173'
const TELEMETRY_API_KEY = process.env.TELEMETRY_API_KEY ?? 'dev-telemetry-key'
const POSITIONS_CHANNEL = 'positions:update'

async function checkGeofences(vehicleId: string, lat: number, lng: number): Promise<void> {
  const point = `POINT(${lng} ${lat})`
  const inside = await db.execute(sql`
    SELECT id, name, type FROM geofences
    WHERE is_active = true AND geom IS NOT NULL
      AND ST_Contains(geom, ST_GeomFromText(${point}, 4326))
  `) as Array<{ id: string; name: string; type: string }>

  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.vehicleId, vehicleId), eq(trips.status, 'in_progress')),
    columns: { id: true },
  })

  for (const fence of (inside as any[]).filter(f => f?.id)) {
    const recent = await db.execute(sql`
      SELECT id FROM geofence_events
      WHERE geofence_id = ${fence.id} AND vehicle_id = ${vehicleId}
        AND event_type = 'entry' AND occurred_at > NOW() - INTERVAL '5 minutes'
      LIMIT 1
    `)
    if ((recent as any[]).length > 0) continue

    await db.insert(geofenceEvents).values({
      geofenceId: fence.id, vehicleId,
      tripId: trip?.id, eventType: 'entry',
      lat: String(lat), lng: String(lng),
    })

    if (fence.type === 'zona_restrita' || fence.type === 'zona_perigo') {
      await redis.publish('alerts:new', JSON.stringify({
        type: 'alert:new', severity: fence.type === 'zona_perigo' ? 'critico' : 'medio',
        alertType: 'entrou_geofence', vehicleId, tripId: trip?.id,
        title: `Entrada em zona — ${fence.name}`,
      }))
    }
    logger.info({ geofenceId: fence.id, vehicleId, name: fence.name }, 'geofence entry')
  }
}

async function computeSlaStatus(vehicleId: string): Promise<string> {
  const trip = await db.query.trips.findFirst({
    where: eq(trips.vehicleId, vehicleId),
    columns: { id: true, slaStatus: true, status: true },
  })
  if (!trip || trip.status !== 'in_progress') return 'sem_sinal'
  return trip.slaStatus ?? 'no_prazo'
}

export const app = new Elysia()
  .use(cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }))
  .use(swagger({
    path: '/swagger',
    documentation: {
      info: { title: 'Torre de Controle API', version: '0.2.0', description: 'API de monitoramento de entregas em tempo real' },
      tags: [
        { name: 'auth',         description: 'Autenticação (HttpOnly Cookie JWT)' },
        { name: 'trips',        description: 'Viagens e KPIs' },
        { name: 'drivers',      description: 'Motoristas e KPIs' },
        { name: 'alerts',       description: 'Alertas + tratativas' },
        { name: 'vehicles',     description: 'Frota' },
        { name: 'dashboard',    description: 'KPIs agregados (Redis cache)' },
        { name: 'telemetry',    description: 'GPS ingest + posições em tempo real' },
        { name: 'geofences',    description: 'Zonas geográficas + entrada/saída via PostGIS' },
        // Phase 6 tags
        { name: 'insights',     description: 'Analytics agregados (Redis cache 30s)' },
        { name: 'exports',      description: 'CSV streaming (UTF-8 BOM, ; delim)' },
        { name: 'push',         description: 'Web Push subscriptions + entrega (VAPID)' },
        { name: 'users',        description: 'CRUD de usuários (admin) + prefs próprias' },
        { name: 'thresholds',   description: 'Thresholds de alerta (in-memory cache 60s)' },
        { name: 'gps-providers', description: 'Configuração de providers GPS (stubs)' },
        // Phase 7 tag
        { name: 'ranking',      description: 'Ranking de motoristas (proxy Supabase ride-rank + Sheets, Redis cache 60s)' },
        // Phase 11 tag
        { name: 'positions',    description: 'Posições de frota importada (read-only, enriquecido c/ ranking)' },
      ],
    },
  }))
  .get('/', () => ({ status: 'ok', service: 'torre-api', version: '0.2.0' }))
  // Health endpoint for Docker/Traefik healthcheck (routed by Path('/health'))
  .get('/health', async ({ set }) => {
    try {
      await redis.ping()
      return { status: 'ok', service: 'torre-api', ts: new Date().toISOString() }
    } catch (e: any) {
      set.status = 503
      return { status: 'degraded', error: e?.message ?? 'redis unreachable' }
    }
  })
  .onError(({ code, error, set }) => {
    const msg = error instanceof Error ? error.message : String(error)
    if (code === 'VALIDATION') { set.status = 422; return { error: 'Validation error', details: msg.slice(0, 200) } }
    if (set.status === 401 || set.status === 403 || set.status === 404 || set.status === 429) return { error: msg }
    logger.error({ code, error: msg }, 'unhandled error')
    set.status = 500
    return { error: 'Internal server error' }
  })
  // Geofences — inlined BEFORE auth plugins to avoid authGuard derive leak (Elysia 1.4.28)
  .get('/api/geofences', async ({ set }) => {
    try { return db.select().from(geofences).orderBy(desc(geofences.createdAt)) }
    catch (e: any) { set.status = 500; return { error: e.message } }
  })
  .get('/api/geofences/:id', async ({ params, set }) => {
    const [f] = await db.select().from(geofences).where(eq(geofences.id, params.id))
    if (!f) { set.status = 404; return { error: 'Not found' } }
    return f
  })
  .get('/api/geofences/:id/events', async ({ params }) => {
    return db.select().from(geofenceEvents).where(eq(geofenceEvents.geofenceId, params.id)).orderBy(desc(geofenceEvents.occurredAt)).limit(100)
  })
  .use(authPlugin)
  .use(tripsPlugin)
  .use(driversPlugin)
  .use(alertsPlugin)
  .use(vehiclesPlugin)
  .use(dashboardPlugin)
  // Phase 6 plugins (plans 06-02, 06-03, 06-04) — wired BEFORE wsPlugin so the
  // WebSocket upgrade plugin remains last (Elysia 1.4 plugin POST order rule).
  .use(insightsPlugin)
  .use(exportsPlugin)
  .use(pushPlugin)
  .use(usersPlugin)
  .use(thresholdsPlugin)
  .use(gpsProvidersPlugin)
  // Phase 7 — ranking wired BEFORE wsPlugin (wsPlugin must remain the last
  // plugin: Elysia 1.4 plugin POST-order rule, see Phase 6 note above).
  .use(rankingPlugin)
  // Phase 9 — ranking write plugin wired AFTER rankingPlugin and BEFORE wsPlugin.
  // requireRole('admin','supervisor') is applied at plugin level (T-09-03).
  .use(rankingWritePlugin)
  // Phase 11 — positions read wired BEFORE wsPlugin (wsPlugin-last rule, Elysia 1.4).
  .use(positionsReadPlugin)
  .use(slaPlugin)
  .use(communicationsPlugin)
  .use(biPlugin)
  .use(forecastPlugin)
  // Phase 12 — Torre KPIs (BEFORE wsPlugin: Elysia 1.4 plugin-last rule)
  .use(torrePlugin)
  .use(operatorsPlugin)
  .use(syncPlugin)
  .use(wsPlugin)
  // Telemetry inlined to avoid Elysia 1.4.28 plugin-composition issue with body schema
  .post('/api/telemetry/ingest', async ({ body, headers, set }) => {
    const apiKey = (headers as Record<string,string>)['x-api-key'] ?? (headers as Record<string,string>)['authorization']?.replace('Bearer ', '')
    if (apiKey !== TELEMETRY_API_KEY) { set.status = 401; return { error: 'Invalid API key' } }
    const { vehicleId, lat, lng, speed, heading, capturedAt } = body as any
    const vehicle = await db.query.vehicles.findFirst({ where: eq(vehicles.id, vehicleId), columns: { id: true, driverId: true } })
    if (!vehicle) { set.status = 404; return { error: 'Vehicle not found' } }
    const pos = { vehicleId, lat: String(lat), lng: String(lng), speed: String(speed ?? 0), heading: String(heading ?? 0), capturedAt: capturedAt ?? new Date().toISOString() }
    await redis.hset(`vehicle:${vehicleId}:position`, pos)
    await redis.expire(`vehicle:${vehicleId}:position`, 300)
    if (vehicle.driverId) await db.update(drivers).set({ lat: String(lat), lng: String(lng) }).where(eq(drivers.id, vehicle.driverId))
    const slaStatus = await computeSlaStatus(vehicleId)
    await redis.publish(POSITIONS_CHANNEL, JSON.stringify({ ...pos, slaStatus, lat, lng }))

    // Alert detection (inline async, ~50ms overhead)
    await processAlertDetection(vehicleId, lat, lng, Number(speed ?? 0), capturedAt ?? new Date().toISOString()).catch(e =>
      logger.error({ error: e.message }, 'alert detection error')
    )

    // Geofence spatial check (fire-and-forget — PostGIS)
    checkGeofences(vehicleId, lat, lng).catch(e => logger.error({ error: e.message }, 'geofence check error'))

    logger.debug({ vehicleId, lat, lng, slaStatus }, 'telemetry ingested')
    return { ok: true, slaStatus }
  })
  .get('/api/telemetry/positions', async () => {
    const keys = await redis.keys('vehicle:*:position')
    const positions = await Promise.all(keys.map(async k => { const p = await redis.hgetall(k); return p && Object.keys(p).length > 0 ? p : null }))
    return positions.filter(Boolean)
  })
  // Geofences write routes — after plugins so body parsing works correctly
  .post('/api/geofences', async ({ body, set }) => {
    const b = body as any
    if (!b?.name) { set.status = 400; return { error: 'name required' } }
    const [fence] = await db.insert(geofences).values({
      name: b.name, type: b.type ?? 'zona_restrita', color: b.color ?? '#ef4444',
      coordinates: b.coordinates, description: b.description,
    }).returning()
    const coords = (b.coordinates as number[][][])[0]!.map(([lng, lat]: number[]) => `${lng} ${lat}`).join(',')
    const wkt = 'POLYGON((' + coords + '))'
    await db.execute(sql`UPDATE geofences SET geom = ST_GeomFromText(${wkt}, 4326) WHERE id = ${fence.id}`)
    return fence
  })
  .patch('/api/geofences/:id', async ({ params, body, set }) => {
    const b = body as any
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (b?.name !== undefined) updates.name = b.name
    if (b?.type !== undefined) updates.type = b.type
    if (b?.color !== undefined) updates.color = b.color
    if (b?.isActive !== undefined) updates.isActive = b.isActive
    if (b?.description !== undefined) updates.description = b.description
    if (b?.coordinates !== undefined) updates.coordinates = b.coordinates
    const [f] = await db.update(geofences).set(updates as any).where(eq(geofences.id, params.id)).returning()
    if (!f) { set.status = 404; return { error: 'Not found' } }
    if (b?.coordinates) {
      const coords = (b.coordinates as number[][][])[0]!.map(([lng, lat]: number[]) => `${lng} ${lat}`).join(',')
      await db.execute(sql`UPDATE geofences SET geom = ST_GeomFromText(${'POLYGON((' + coords + '))'}, 4326) WHERE id = ${f.id}`)
    }
    return f
  })
  .delete('/api/geofences/:id', async ({ params, set }) => {
    await db.delete(geofences).where(eq(geofences.id, params.id))
    set.status = 204; return ''
  })
  // Phase 10 — POST /api/positions/import (multipart xlsx upload, admin only)
  // Inlined to avoid Elysia 1.4.28 body/multipart bug with plugin composition.
  // Gate: espelha authGuard + requireRole('admin') do rbac.ts via jose direto.
  .post('/api/positions/import', async ({ body, cookie, set }) => {
    // ── Gate admin (T1, D-10-03) ─────────────────────────────────────────────
    const token = (cookie as any).access_token?.value as string | undefined
    if (!token) {
      set.status = 401
      return { error: 'Unauthorized: no session cookie' }
    }
    let payload: jose.JWTPayload & { role?: string; jti?: string }
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET)
      const { payload: p } = await jose.jwtVerify(token, secret)
      payload = p
    } catch {
      set.status = 401
      return { error: 'Unauthorized: invalid token' }
    }
    if (payload.jti) {
      const blacklisted = await redis.get(`session:blacklist:${payload.jti}`)
      if (blacklisted) {
        set.status = 401
        return { error: 'Unauthorized: token revoked' }
      }
    }
    if (payload.role !== 'admin') {
      set.status = 403
      return { error: 'Forbidden: requires role admin' }
    }

    // ── Validação do upload (T2) ──────────────────────────────────────────────
    const b = body as any
    const file = b?.file as File | undefined
    if (!file) {
      set.status = 400
      return { error: 'Missing file field in multipart body' }
    }
    const MAX_SIZE = 10 * 1024 * 1024  // 10 MB
    if (file.size > MAX_SIZE) {
      set.status = 413
      return { error: `File too large (max ${MAX_SIZE / 1024 / 1024} MB)` }
    }
    const filename = (file as any).name ?? ''
    const validMime = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ]
    if (!filename.toLowerCase().endsWith('.xlsx') && !validMime.includes(file.type)) {
      set.status = 400
      return { error: 'Only .xlsx files are accepted' }
    }

    const buf = Buffer.from(await file.arrayBuffer())

    // ── Parse (D-10-05) ───────────────────────────────────────────────────────
    let rows: ReturnType<typeof parseViagensXlsx>
    try {
      rows = parseViagensXlsx(buf)
    } catch {
      set.status = 400
      return { error: 'Failed to parse xlsx — file may be corrupt or not a valid xlsx' }
    }

    const MAX_ROWS = 5000  // cap defensivo T2
    const total = rows.length
    const toProcess = rows.slice(0, MAX_ROWS)

    // ── Orquestração sequencial: geocode → upsert → geom (D-10-01/04, T3/T4) ─
    let inserted = 0
    let skipped = 0
    let failed = 0
    const sample: Array<{
      motorista: string; dataPosicao: string;
      cidade: string | null; uf: string | null; geocoded: boolean
    }> = []

    for (const row of toProcess) {
      try {
        const g = await geocodeText(row.posicaoRaw)

        const [ins] = await db
          .insert(driverPositions)
          .values({
            motorista:     row.motorista,
            motoristaNorm: row.motoristaNorm,
            dataPosicao:   row.dataPosicao,
            posicaoRaw:    row.posicaoRaw,
            veiculo:       row.veiculo,
            cidade:        g.cidade,
            uf:            g.uf,
            lat:           g.lat !== null ? String(g.lat) : null,
            lng:           g.lng !== null ? String(g.lng) : null,
            geocoded:      g.geocoded,
          })
          .onConflictDoNothing({
            target: [driverPositions.motoristaNorm, driverPositions.dataPosicao],
          })
          .returning({ id: driverPositions.id })

        if (!ins) {
          // ON CONFLICT DO NOTHING → row already exists (idempotência D-10-04)
          skipped++
        } else {
          inserted++
          // Atualiza geom via ST_MakePoint(lng, lat) — ordem X,Y (T4)
          if (g.geocoded && g.lat !== null && g.lng !== null) {
            await db.execute(
              sql`UPDATE driver_positions
                  SET geom = ST_SetSRID(ST_MakePoint(${g.lng}, ${g.lat}), 4326)
                  WHERE id = ${ins.id}`,
            )
          }
          if (sample.length < 5) {
            sample.push({
              motorista:   row.motorista,
              dataPosicao: row.dataPosicao.toISOString(),
              cidade:      g.cidade,
              uf:          g.uf,
              geocoded:    g.geocoded,
            })
          }
        }
      } catch {
        // Best-effort: falha de linha não derruba o import (D-10-01)
        failed++
      }
    }

    // ── Resposta (D-10-07) ────────────────────────────────────────────────────
    return { inserted, skipped, failed, total, sample }
  })
  .listen(PORT, () => {
    logger.info({ port: PORT, frontendUrl: FRONTEND_URL }, 'torre-api listening')
    // Phase 12 — jobs Angellira (posições + monitoramento + detectores). No-op se env ausente.
    startAngelliraJobs()
  })

// Eden Treaty type export (D-04)
export type App = typeof app
