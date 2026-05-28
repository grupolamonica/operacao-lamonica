import { Queue, Worker, type Job } from 'bullmq'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/client'
import { redis } from '../redis/client'
import { trips } from '../db/schema/trips'
import { alerts } from '../db/schema/alerts'
import { logger } from '../lib/logger'

if (!process.env.REDIS_URL) throw new Error('REDIS_URL is not defined')

const QUEUE_NAME = 'alert-engine'
const ALERT_BROADCAST_CHANNEL = 'alerts:new'

// Parse REDIS_URL to ioredis-compatible connection options
function parseRedisUrl(url: string) {
  const u = new URL(url)
  return { host: u.hostname, port: Number(u.port) || 6379, password: u.password || undefined }
}

// Thresholds
const DELAY_CRITICAL_MINUTES = 30   // trip.eta > windowEnd + 30min → atraso_critico
const STOP_MINUTES            = 5    // speed < 2 km/h for > 5min → parada_nao_planejada
const SIGNAL_LOSS_MINUTES     = 10   // no position update > 10min → sinal_gps_intermitente

export type PositionJob = {
  vehicleId: string
  tripId:    string
  lat:       number
  lng:       number
  speed:     number
  slaStatus: string
  capturedAt: string
}

const connection = parseRedisUrl(process.env.REDIS_URL)

export const alertQueue = new Queue<PositionJob>(QUEUE_NAME, {
  connection,
  defaultJobOptions: { removeOnComplete: 100, removeOnFail: 50 },
})

// --------- Worker ---------

async function processPosition(job: Job<PositionJob>) {
  const { vehicleId, tripId, lat, lng, speed, capturedAt } = job.data

  // Fetch trip context
  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.id, tripId), eq(trips.status, 'in_progress')),
    with: { client: { columns: { name: true } }, route: { columns: { code: true } } },
  })
  if (!trip) return

  const now = new Date()
  const capturedTime = new Date(capturedAt)
  const detectedAlerts: Array<{ type: string; severity: string; title: string; description: string; delayMinutes?: number }> = []

  // 1. Critical delay detection
  if (trip.eta && trip.windowEnd) {
    const delayMs = trip.eta.getTime() - trip.windowEnd.getTime()
    const delayMin = Math.round(delayMs / 60_000)
    if (delayMin >= DELAY_CRITICAL_MINUTES) {
      const existing = await db.query.alerts.findFirst({
        where: and(eq(alerts.tripId, tripId), eq(alerts.type, 'atraso_critico'), eq(alerts.status, 'aberto')),
      })
      if (!existing) {
        detectedAlerts.push({
          type: 'atraso_critico',
          severity: delayMin >= 60 ? 'critico' : 'medio',
          title: `Atraso crítico — ${trip.code}`,
          description: `Viagem com ${delayMin}min de atraso previsto. ETA: ${trip.eta.toLocaleTimeString('pt-BR')}`,
          delayMinutes: delayMin,
        })
      }
    }
  }

  // 2. Unplanned stop detection
  if (speed < 2) {
    const stopKey = `stop:${vehicleId}`
    const firstStopStr = await redis.get(stopKey)
    if (!firstStopStr) {
      await redis.set(stopKey, capturedAt, 'EX', 3600)
    } else {
      const firstStop = new Date(firstStopStr)
      const stopMinutes = Math.round((capturedTime.getTime() - firstStop.getTime()) / 60_000)
      if (stopMinutes >= STOP_MINUTES) {
        const existing = await db.query.alerts.findFirst({
          where: and(eq(alerts.tripId, tripId), eq(alerts.type, 'parada_nao_planejada'), eq(alerts.status, 'aberto')),
        })
        if (!existing) {
          detectedAlerts.push({
            type: 'parada_nao_planejada',
            severity: 'medio',
            title: `Parada não planejada — ${trip.code}`,
            description: `Veículo parado há ${stopMinutes}min. Velocidade: ${speed} km/h`,
          })
        }
      }
    }
  } else {
    await redis.del(`stop:${vehicleId}`)
  }

  // 3. Signal loss detection (checked via last update age)
  const lastUpdateKey = `last_update:${vehicleId}`
  const lastUpdateStr = await redis.get(lastUpdateKey)
  if (lastUpdateStr) {
    const lastUpdate = new Date(lastUpdateStr)
    const silenceMin = Math.round((now.getTime() - lastUpdate.getTime()) / 60_000)
    if (silenceMin >= SIGNAL_LOSS_MINUTES) {
      const existing = await db.query.alerts.findFirst({
        where: and(eq(alerts.tripId, tripId), eq(alerts.type, 'sinal_gps_intermitente'), eq(alerts.status, 'aberto')),
      })
      if (!existing) {
        detectedAlerts.push({
          type: 'sinal_gps_intermitente',
          severity: 'baixo',
          title: `Sinal GPS intermitente — ${trip.code}`,
          description: `Sem atualização há ${silenceMin}min`,
        })
      }
    }
  }
  await redis.set(lastUpdateKey, capturedAt, 'EX', 3600)

  // Insert detected alerts and broadcast
  for (const a of detectedAlerts) {
    try {
      const [inserted] = await db.insert(alerts).values({
        type:         a.type,
        severity:     a.severity as any,
        status:       'aberto',
        tripId,
        driverId:     trip.driverId,
        vehicleId,
        title:        a.title,
        description:  a.description,
        source:       'Telemetria',
        lat:          String(lat),
        lng:          String(lng),
        delayMinutes: a.delayMinutes,
        occurredAt:   now,
        slaDeadline:  new Date(now.getTime() + 4 * 3600_000),
      }).returning()

      await redis.publish(ALERT_BROADCAST_CHANNEL, JSON.stringify({
        type:     'alert:new',
        alertId:  inserted.id,
        severity: a.severity,
        alertType: a.type,
        tripId,
        title:    a.title,
      }))

      logger.info({ alertId: inserted.id, type: a.type, tripId }, 'alert created')
    } catch (e: any) {
      logger.error({ error: e.message, alertType: a.type }, 'alert insert failed')
    }
  }
}

export function startAlertWorker() {
  const worker = new Worker<PositionJob>(QUEUE_NAME, processPosition, {
    connection,
    concurrency: 5,
  })

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'alert job failed')
  })

  logger.info('Alert engine worker started')
  return worker
}
