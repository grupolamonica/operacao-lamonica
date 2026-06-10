import { Elysia } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { syncMonitoring } from '../../adapters/angellira/monitoring.adapter'
import { syncPainel } from '../../adapters/painel-sheet/painel-sync'
import { syncPositions } from '../../adapters/angellira/positions.adapter'
import { syncCargas } from '../../modules/cargas/cargas.sync'
import { redis } from '../../redis/client'
import { logger } from '../../lib/logger'

const LAST_SYNC_KEY = 'sync:all:last'
const RUNNING_KEY = 'sync:all:running'
const RUNNING_TTL = 300 // s — failsafe se o processo morrer no meio

type SourceResult = { ok: boolean; ms: number; result?: unknown; error?: string }
type SyncAllSummary = {
  startedAt: string
  finishedAt: string
  durationMs: number
  sources: Record<'painel' | 'monitoring' | 'positions' | 'cargas', SourceResult>
}

/**
 * Sincroniza TODAS as fontes (planilha do painel + monitoramento + posições
 * Angellira + Cargas PROD) → Torre DB. Sequencial de propósito: painel-sync e
 * cargas-sync tocam `trips` (o painel deduplica source='cargas' por sheet_lh) —
 * paralelo arriscaria conflito. Os tickets pesados (75k linhas, ~100s) são
 * forçados (ignora o gate de 30min) porque o gatilho manual quer tudo fresco.
 *
 * Roda em BACKGROUND (o /all não espera) — o front acompanha por /status.
 */
async function runSyncAll(): Promise<void> {
  const startedAt = new Date()
  try { await redis.del('painel:tickets') } catch { /* best-effort */ }

  const run = async (fn: () => Promise<unknown>): Promise<SourceResult> => {
    const t0 = Date.now()
    try { return { ok: true, ms: Date.now() - t0, result: await fn() } }
    catch (e) { return { ok: false, ms: Date.now() - t0, error: (e as Error)?.message ?? String(e) } }
  }

  const painel     = await run(syncPainel)
  const monitoring = await run(syncMonitoring)
  const positions  = await run(syncPositions)
  const cargas     = await run(syncCargas)

  const finishedAt = new Date()
  const summary: SyncAllSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    sources: { painel, monitoring, positions, cargas },
  }
  try {
    await redis.set(LAST_SYNC_KEY, JSON.stringify(summary))
    await redis.del(RUNNING_KEY)
  } catch { /* best-effort */ }
  logger.info(
    { durationMs: summary.durationMs, sources: Object.fromEntries(Object.entries(summary.sources).map(([k, v]) => [k, v.ok])) },
    '[sync] sync-all concluído',
  )
}

/** Gatilho manual de sincronização (Phase 12/14). */
export const syncPlugin = new Elysia({ name: 'sync' })
  .use(authGuard)
  .group('/api/sync', (app) =>
    app
      .post('/monitoramento', () => syncMonitoring(), {
        detail: { tags: ['sync'], summary: 'Sync manual do monitoramento Angellira (viagens ao vivo)' },
      })
      // alias retrocompat
      .post('/carrega', () => syncMonitoring(), {
        detail: { tags: ['sync'], summary: 'Alias de /monitoramento' },
      })
      // Sync do painel GAS (planilha de produção → trips source='painel') — espelho exato do painel
      .post('/painel', () => syncPainel(), {
        detail: { tags: ['sync'], summary: 'Sync da planilha de produção do painel (Carrega + HistoricoConcluidas)' },
      })
      // Phase 14 — sincroniza TUDO de uma vez, em background (planilha + Angellira + Cargas).
      // Retorna na hora; o front acompanha por GET /status. Coalesce: se já roda, não duplica.
      .post('/all', async () => {
        const already = await redis.get(RUNNING_KEY).catch(() => null)
        if (already) return { started: false, running: true }
        try { await redis.set(RUNNING_KEY, new Date().toISOString(), 'EX', RUNNING_TTL) } catch { /* best-effort */ }
        // fire-and-forget: não await — libera o flag mesmo em erro
        void runSyncAll().catch(async (e) => {
          logger.error({ err: (e as Error)?.message }, '[sync] sync-all falhou')
          try { await redis.del(RUNNING_KEY) } catch { /* noop */ }
        })
        return { started: true, running: true }
      }, {
        detail: { tags: ['sync'], summary: 'Dispara sync completo (planilha + Angellira + Cargas) em background' },
      })
      // Estado da sincronização: se está rodando + resumo da última conclusão.
      .get('/status', async () => {
        try {
          const [running, raw] = await Promise.all([redis.get(RUNNING_KEY), redis.get(LAST_SYNC_KEY)])
          return { running: !!running, startedAt: running || null, last: raw ? (JSON.parse(raw) as SyncAllSummary) : null }
        } catch { return { running: false, startedAt: null, last: null } }
      }, {
        detail: { tags: ['sync'], summary: 'Estado da sincronização completa (running + último resumo)' },
      }),
  )
