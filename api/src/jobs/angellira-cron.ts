/**
 * Jobs repeatable BullMQ (D-12-30 / D-12-32) — rodam no worker da API Torre.
 *   - 'positions' a cada 3min  → syncPositions() (Angellira → driver_positions)
 *   - 'detectors' a cada 60min → runDetectors()  (gera/auto-fecha ocorrências)
 *
 * Guardado por env: só inicia se ANGELLIRA_USER/PASS/EMPRESA + REDIS_URL existirem.
 * Idempotência de agendamento: jobId fixo por repeat (BullMQ não duplica).
 */
import { Queue, Worker, type Job } from 'bullmq'
import { logger } from '../lib/logger'
import { syncPositions } from '../adapters/angellira/positions.adapter'
import { runDetectors } from '../modules/alerts/detectors.service'

const QUEUE_NAME = 'angellira-cron'

function parseRedisUrl(url: string) {
  const u = new URL(url)
  return { host: u.hostname, port: Number(u.port) || 6379, password: u.password || undefined }
}

let started = false

export function startAngelliraJobs(): void {
  if (started) return
  const hasCreds = process.env.ANGELLIRA_USER && process.env.ANGELLIRA_PASS && process.env.ANGELLIRA_EMPRESA
  if (!hasCreds) {
    logger.warn('[angellira] jobs desativados — defina ANGELLIRA_USER/PASS/EMPRESA')
    return
  }
  if (!process.env.REDIS_URL) {
    logger.warn('[angellira] jobs desativados — REDIS_URL ausente')
    return
  }
  started = true
  const connection = parseRedisUrl(process.env.REDIS_URL)

  const queue = new Queue(QUEUE_NAME, { connection, defaultJobOptions: { removeOnComplete: 50, removeOnFail: 30 } })

  const worker = new Worker(QUEUE_NAME, async (job: Job) => {
    if (job.name === 'positions') return syncPositions()
    if (job.name === 'detectors') return runDetectors()
  }, { connection })

  worker.on('completed', (job, result) => logger.info({ job: job.name, result }, '[angellira] job ok'))
  worker.on('failed', (job, err) => logger.error({ job: job?.name, err: err?.message }, '[angellira] job falhou'))

  // Agenda repeatables (idempotente — mesmo padrão não duplica)
  void queue.add('positions', {}, { repeat: { pattern: '*/3 * * * *' }, jobId: 'angellira-positions' })
  void queue.add('detectors', {}, { repeat: { pattern: '0 * * * *' },   jobId: 'angellira-detectors' })

  logger.info('[angellira] jobs agendados — positions */3min, detectors hora cheia')
}
