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
import { syncMonitoring } from '../adapters/angellira/monitoring.adapter'
import { syncPainel } from '../adapters/painel-sheet/painel-sync'
import { runDetectors } from '../modules/alerts/detectors.service'
import { syncCargas } from '../modules/cargas/cargas.sync'
import { syncRankTrips } from '../adapters/spx-portal/rank-trips-sync.adapter'
import { trackOpStatusTransitions } from '../modules/operacional/operacional.service'

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
    if (job.name === 'monitoring') return syncMonitoring()
    if (job.name === 'painel') return syncPainel()
    if (job.name === 'detectors') return runDetectors()
    if (job.name === 'cargas') return syncCargas()
    if (job.name === 'rank-sync') return syncRankTrips()
    if (job.name === 'op-tracker') return trackOpStatusTransitions()
  }, { connection })

  worker.on('completed', (job, result) => logger.info({ job: job.name, result }, '[angellira] job ok'))
  worker.on('failed', (job, err) => logger.error({ job: job?.name, err: err?.message }, '[angellira] job falhou'))

  // Agenda repeatables (idempotente — mesmo padrão não duplica)
  void queue.add('positions', {}, { repeat: { pattern: '*/3 * * * *' }, jobId: 'angellira-positions' })
  void queue.add('monitoring', {}, { repeat: { pattern: '*/5 * * * *' }, jobId: 'angellira-monitoring' })
  // Painel-sheet: reconciliação INCREMENTAL a cada 10min (upsert só do que falta/mudou; tickets pesados gated 30min).
  void queue.add('painel', {}, { repeat: { pattern: '*/10 * * * *' }, jobId: 'painel-sheet-sync' })
  // Detectores de ocorrência a CADA 30min — re-tickam enquanto o problema persiste (~2/h, igual ao painel).
  // A cadência mudou (era '0 * * * *'); o repeatable antigo persiste no Redis entre deploys e rodaria em
  // paralelo (duplo disparo às :00). Remove qualquer repeatable 'detectors' antes de reagendar.
  void (async () => {
    try {
      const reps = await queue.getRepeatableJobs()
      for (const r of reps) if (r.name === 'detectors') await queue.removeRepeatableByKey(r.key)
    } catch { /* best-effort */ }
    await queue.add('detectors', {}, { repeat: { pattern: '*/30 * * * *' }, jobId: 'angellira-detectors' })
  })()
  // Phase 14 — sync do Cargas a cada 15min: open-loads + candidatos + cargas→trips + enrich por LH.
  void queue.add('cargas', {}, { repeat: { pattern: '*/15 * * * *' }, jobId: 'cargas-sync' })
  // Phase 15 — sync das viagens Shopee (SPX/asp) → tabela `trips` do ranking a cada 10min.
  void queue.add('rank-sync', {}, { repeat: { pattern: '*/10 * * * *' }, jobId: 'rank-trips-sync' })
  // Controle Operacional — rastreia transições de status (SPX) a cada 2min → Log + movimentações ao vivo.
  void queue.add('op-tracker', {}, { repeat: { pattern: '*/2 * * * *' }, jobId: 'op-status-tracker' })

  logger.info('[angellira] jobs agendados — positions */3min, monitoring */5min, painel */10min, cargas */15min, rank-sync */10min, op-tracker */2min, detectors hora cheia')
}
