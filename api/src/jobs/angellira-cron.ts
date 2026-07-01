/**
 * Jobs repeatable BullMQ (D-12-30 / D-12-32) — rodam no worker da API Torre.
 *   - 'positions' a cada 3min  → syncPositions() (Angellira → driver_positions)
 *   - 'detectors' a cada 60min → runDetectors()  (gera/auto-fecha ocorrências)
 *
 * Guardado por env: só inicia se ANGELLIRA_USER/PASS/EMPRESA + REDIS_URL existirem.
 * Idempotência de agendamento: jobId fixo por repeat (BullMQ não duplica).
 */
import { Queue, Worker, type Job } from 'bullmq'
import { sql } from 'drizzle-orm'
import { db } from '../db/client'
import { logger } from '../lib/logger'
import { syncPositions } from '../adapters/angellira/positions.adapter'
import { syncMonitoring, closeStaleTrips } from '../adapters/angellira/monitoring.adapter'
import { recomputeCanonicalKeys } from '../modules/trips/trips.service'
import { syncPainel } from '../adapters/painel-sheet/painel-sync'
import { runDetectors } from '../modules/alerts/detectors.service'
import { syncCargas } from '../modules/cargas/cargas.sync'
import { syncRankTrips } from '../adapters/spx-portal/rank-trips-sync.adapter'
import { trackOpStatusTransitions } from '../modules/operacional/operacional.service'

const QUEUE_NAME = 'angellira-cron'

// Alerta de "feed Angellira fora" (P6) — id fixo p/ upsert (1 alerta, atualiza em vez de duplicar).
const FEED_ALERT_ID = '00000000-0000-5000-8000-0000000a9e11'
async function raiseFeedAlert(job: string, msg: string): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO alerts (id, type, severity, status, priority, trip_id, title, description, source, occurred_at, resolved_at, created_at)
      VALUES (${FEED_ALERT_ID}, 'feed_down', 'critico', 'aberto', 'alta', NULL,
              'Feed Angellira fora do ar', ${`Job '${job}' falhou: ${msg}`.slice(0, 500)}, 'Sistema', now(), NULL, now())
      ON CONFLICT (id) DO UPDATE SET status='aberto', severity='critico',
        description=EXCLUDED.description, resolved_at=NULL, occurred_at=now()
    `)
  } catch { /* best-effort: alerta não pode derrubar o worker */ }
}
async function resolveFeedAlert(): Promise<void> {
  try {
    await db.execute(sql`UPDATE alerts SET status='resolvido', resolved_at=now() WHERE id=${FEED_ALERT_ID} AND status <> 'resolvido'`)
  } catch { /* best-effort */ }
}

function parseRedisUrl(url: string) {
  const u = new URL(url)
  return { host: u.hostname, port: Number(u.port) || 6379, password: u.password || undefined }
}

let started = false

export function startAngelliraJobs(): void {
  if (started) return
  // Credenciais Angellira resolvidas em runtime pelo auth.ts (tabela integration_credentials
  // OU env) — não bloqueia o agendamento aqui; se faltar, o job falha e dispara o alerta de feed.
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
    if (job.name === 'close-stale') { const r = await closeStaleTrips(); await recomputeCanonicalKeys(); return r }
  }, { connection })

  // P6 — feed Angellira: ao recuperar (positions/monitoring OK) resolve o alerta; ao falhar, levanta.
  const isFeedJob = (n?: string) => n === 'positions' || n === 'monitoring'
  worker.on('completed', (job, result) => {
    logger.info({ job: job.name, result }, '[angellira] job ok')
    if (isFeedJob(job.name)) void resolveFeedAlert()
  })
  worker.on('failed', (job, err) => {
    logger.error({ job: job?.name, err: err?.message }, '[angellira] job falhou')
    if (isFeedJob(job?.name)) void raiseFeedAlert(job!.name, err?.message ?? 'erro')
  })

  // Agenda repeatables (idempotente — mesmo padrão não duplica)
  void queue.add('positions', {}, { repeat: { pattern: '*/3 * * * *' }, jobId: 'angellira-positions' })
  void queue.add('monitoring', {}, { repeat: { pattern: '*/5 * * * *' }, jobId: 'angellira-monitoring' })
  // Painel-sheet: reconciliação a cada 3min. As CONCLUSÕES do painel (Chegada Descarga / km<=2 na aba
  // Carrega) só chegam à Torre por AQUI — o close-stale (*/5min) só fecha por km<=2, não vê "Chegada
  // Descarga". A */10min anterior deixava a viagem "em andamento" na Torre por até ~10min depois de
  // concluída no painel ao vivo → "concluídas 1 a menos" transitório. Carrega+HistoricoConcluidas são
  // leves; os tickets pesados (75k) seguem gated a ~30min DENTRO do syncPainel, então */3min não os re-baixa.
  // O repeatable */10 antigo persiste no Redis entre deploys e rodaria em paralelo — remove antes de reagendar.
  void (async () => {
    try {
      const reps = await queue.getRepeatableJobs()
      for (const r of reps) if (r.name === 'painel' && r.pattern !== '*/3 * * * *') await queue.removeRepeatableByKey(r.key)
    } catch { /* best-effort */ }
    await queue.add('painel', {}, { repeat: { pattern: '*/3 * * * *' }, jobId: 'painel-sheet-sync' })
  })()
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
  // Conclusão unificada (chegou/abandonada) a cada 5min — INDEPENDE do Angellira estar de pé,
  // então fecha as presas mesmo durante uma queda do feed (P1/P2/P3/P4).
  void queue.add('close-stale', {}, { repeat: { pattern: '*/5 * * * *' }, jobId: 'close-stale-trips' })

  logger.info('[angellira] jobs agendados — positions */3min, monitoring */5min, painel */3min, cargas */15min, rank-sync */10min, op-tracker */2min, close-stale */5min, detectors hora cheia')
}
