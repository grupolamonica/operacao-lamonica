/**
 * Cron de planilhas (Phase 12) — sync da aba "Carrega" (monitoramento GRIFFI ao vivo)
 * a cada 5min. Gated só por REDIS_URL (não precisa de credenciais Angellira),
 * então roda também em dev. Idempotente (jobId fixo).
 */
import { Queue, Worker, type Job } from 'bullmq'
import { logger } from '../lib/logger'
import { syncCarrega } from '../adapters/sheets/carrega.adapter'

const QUEUE_NAME = 'sheets-cron'
let started = false

function parseRedisUrl(url: string) {
  const u = new URL(url)
  return { host: u.hostname, port: Number(u.port) || 6379, password: u.password || undefined }
}

export function startSheetsJobs(): void {
  if (started) return
  if (process.env.CARREGA_SYNC === 'off') { logger.warn('[sheets] carrega sync desativado (CARREGA_SYNC=off)'); return }
  if (!process.env.REDIS_URL) { logger.warn('[sheets] jobs desativados — REDIS_URL ausente'); return }
  started = true
  const connection = parseRedisUrl(process.env.REDIS_URL)

  const queue = new Queue(QUEUE_NAME, { connection, defaultJobOptions: { removeOnComplete: 50, removeOnFail: 30 } })
  const worker = new Worker(QUEUE_NAME, async (job: Job) => {
    if (job.name === 'carrega') return syncCarrega()
  }, { connection })

  worker.on('completed', (job, result) => logger.info({ job: job.name, result }, '[sheets] job ok'))
  worker.on('failed', (job, err) => logger.error({ job: job?.name, err: err?.message }, '[sheets] job falhou'))

  void queue.add('carrega', {}, { repeat: { pattern: '*/5 * * * *' }, jobId: 'sheets-carrega' })
  logger.info('[sheets] job agendado — carrega */5min')
}
