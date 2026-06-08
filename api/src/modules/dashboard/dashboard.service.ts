import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { redis } from '../../redis/client'
import { calcularAdiantamentoHoras, PARAMS_PADRAO } from '../../lib/regulamentacao'

/**
 * KPIs do Dashboard — operação GRIFFI AO VIVO (Angellira), SEM planilha do painel.
 *
 * Universo = viagens de código numérico (sync Angellira a cada 5min). No Prazo / Atrasadas são
 * recomputados a cada request (now()) pela lei do motorista (60 km/h, jornada 12h; prazo = window_end
 * = dataPrevFim; kmFalta = distance_total − distance_done). Tickets/Alertas dos detectores próprios.
 */
const TTL = 5
const GRIFFI = sql`code ~ '^[0-9]+$'`
export type PeriodoSla = 'hoje' | '7d' | '30d' | 'tudo'

function cutoff(p: PeriodoSla) {
  if (p === 'hoje') return sql`date_trunc('day', now())`
  if (p === '7d') return sql`now() - interval '7 days'`
  if (p === '30d') return sql`now() - interval '30 days'`
  return sql`'-infinity'::timestamptz`
}

export interface DashboardKpis {
  filtroSla: PeriodoSla
  total: number
  concluidas: number
  noPrazo: number
  atrasadas: number
  aferidas: number
  pctNoPrazo: number
  alertas: number
  ticketsPendentes: number
  motoristasEmRisco: number
  meta: number
}

export async function getDashboardKpis(periodo: PeriodoSla = 'tudo'): Promise<DashboardKpis> {
  const key = `kpi:dashboard:${periodo}`
  try { const c = await redis.get(key); if (c) return JSON.parse(c) } catch { /* fall through */ }

  const cut = cutoff(periodo)
  const [tot] = (await db.execute(sql`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE status='completed')::int AS concluidas
    FROM trips WHERE ${GRIFFI} AND window_start >= ${cut}
  `)) as unknown as Array<{ total: number; concluidas: number }>

  // No Prazo / Atrasadas: recomputado AO VIVO sobre as ATIVAS (lei do motorista).
  const ativas = (await db.execute(sql`
    SELECT distance_total, distance_done, window_end, window_start, morosidade_horas
    FROM trips WHERE ${GRIFFI} AND status NOT IN ('completed','cancelled')
  `)) as unknown as Array<{ distance_total: string | null; distance_done: string | null; window_end: string | null; window_start: string | null; morosidade_horas: string | null }>

  const agora = new Date()
  let noPrazo = 0, atrasadas = 0
  for (const r of ativas) {
    const kmFalta = Math.max(0, Number(r.distance_total ?? 0) - Number(r.distance_done ?? 0))
    if (kmFalta <= PARAMS_PADRAO.kmParaConsiderarChegou || !r.window_end) continue
    if (r.window_start && new Date(r.window_start) > agora) continue
    const adiant = calcularAdiantamentoHoras(kmFalta, new Date(r.window_end), agora, Number(r.morosidade_horas ?? 0), PARAMS_PADRAO)
    if (adiant == null) continue
    if (-adiant > 0) atrasadas++; else noPrazo++
  }
  const aferidas = noPrazo + atrasadas
  const pctNoPrazo = aferidas > 0 ? Math.round((noPrazo / aferidas) * 1000) / 10 : 100

  const [a] = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status IN ('aberto','em_analise','em_tratativa'))::int AS tickets_pendentes,
      count(*) FILTER (WHERE status IN ('aberto','em_analise','em_tratativa')
        AND trip_id IN (SELECT id FROM trips WHERE status NOT IN ('completed','cancelled')))::int AS alertas
    FROM alerts
  `)) as unknown as Array<{ tickets_pendentes: number; alertas: number }>

  const [d] = (await db.execute(sql`
    SELECT count(*) FILTER (WHERE status='on_route' AND avg_delay_minutes > 10)::int AS em_risco FROM drivers
  `)) as unknown as Array<{ em_risco: number }>

  const n = (v: unknown) => Number(v ?? 0)
  const kpis: DashboardKpis = {
    filtroSla: periodo,
    total: n(tot?.total), concluidas: n(tot?.concluidas),
    noPrazo, atrasadas, aferidas, pctNoPrazo,
    alertas: n(a?.alertas), ticketsPendentes: n(a?.tickets_pendentes),
    motoristasEmRisco: n(d?.em_risco), meta: 95,
  }
  try { await redis.set(key, JSON.stringify(kpis), 'EX', TTL) } catch { /* noop */ }
  return kpis
}
