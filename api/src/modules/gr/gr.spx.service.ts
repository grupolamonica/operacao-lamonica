/**
 * Serviço da aba SPX / Shopee. Compõe a matriz por viagem a partir do nosso
 * banco (snapshot + enriched + driver_positions) e deriva os KPIs do dia.
 * Read-only. Espelhamento = última posição conhecida (não rastreador ao vivo).
 */
import { fetchShopeeSnapshot, fetchEnrichedByLh, fetchLastSignalByPlate, type RawSnapRow } from './gr.spx.reads'
import type { SpxRow, SpxOverview, SpxEspelhamento } from './gr.spx.types'

/** posição mais velha que isto (min) conta como "stale"; sem posição = sem_sinal. */
const SIGNAL_STALE_MIN = 180

const norm = (s: string | null | undefined): string =>
  String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const normPlate = (s: string | null | undefined): string =>
  s ? String(s).toUpperCase().replace(/[^A-Z0-9]/g, '') : ''

/** Texto presente e significativo (descarta ruído de planilha). */
const NOISE = new Set(['', '#ref!', 'status', 'sem status', 'n/a', '-', 'sem dado'])
const present = (t: string | null | undefined): boolean => !NOISE.has(norm(t))
const perfilBad = (t: string | null | undefined): boolean => present(t) && norm(t) !== 'conforme'
const checklistBad = (t: string | null | undefined): boolean => present(t) && norm(t) !== 'aprovado'

const clean = (t: string | null | undefined): string | null => {
  const v = String(t ?? '').trim()
  return v && !NOISE.has(norm(v)) ? v : null
}

/** Data YYYY-MM-DD no fuso de Brasília, com offset em dias. */
function brtDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

function espelhamento(cavalo: string | null, signals: Map<string, string>, nowMs: number): SpxEspelhamento {
  const lastAt = signals.get(normPlate(cavalo)) ?? null
  if (!lastAt) return { lastAt: null, status: 'sem_sinal' }
  const ageMin = (nowMs - new Date(lastAt).getTime()) / 60_000
  return { lastAt, status: ageMin > SIGNAL_STALE_MIN ? 'stale' : 'ok' }
}

function assemble(
  r: RawSnapRow,
  enriched: Map<string, { aspx_cpf: string | null; cavalo_angellira_status_text: string | null; carreta_angellira_status_text: string | null }>,
  signals: Map<string, string>,
  nowMs: number,
): SpxRow {
  const e = r.lh ? enriched.get(r.lh) : undefined
  const perfilCavalo = clean(e?.cavalo_angellira_status_text)
  const perfilCarreta = clean(e?.carreta_angellira_status_text)
  const checklistCavalo = clean(r.checklistCavalo)
  const checklistCarreta = clean(r.checklistCarreta)
  const pendencia =
    perfilBad(perfilCavalo) || perfilBad(perfilCarreta) || checklistBad(checklistCavalo) || checklistBad(checklistCarreta)

  return {
    lh: r.lh ?? '',
    data: clean(r.data),
    horario: r.horario ? String(r.horario).slice(0, 5) : null,
    tipo: clean(r.tipo),
    vinculo: clean(r.vinculo),
    motorista: clean(r.motoristas),
    cpf: e?.aspx_cpf ?? null,
    cavalo: clean(r.cavalo),
    carreta: clean(r.carreta),
    origem: clean(r.origem),
    destino: clean(r.destino),
    statusViagem: clean(r.status),
    perfilCavalo,
    perfilCarreta,
    checklistCavalo,
    checklistCarreta,
    checklistCavaloDias: typeof r.checklistCavaloVenc === 'number' ? r.checklistCavaloVenc : null,
    checklistCarretaDias: typeof r.checklistCarretaVenc === 'number' ? r.checklistCarretaVenc : null,
    espelhamento: espelhamento(clean(r.cavalo), signals, nowMs),
    hasDriver: r.hasDriver === true,
    isAvailable: r.isAvailable === true,
    pendencia,
    conforme: !pendencia,
  }
}

/** Monta as linhas da matriz para uma data (YYYY-MM-DD). */
async function loadDay(date: string, nowMs: number): Promise<{ rows: SpxRow[]; syncedAt: string | null }> {
  const snap = await fetchShopeeSnapshot()
  const dayRaw = snap.rows.filter((r) => clean(r.data) === date)
  const [enriched, signals] = await Promise.all([
    fetchEnrichedByLh(dayRaw.map((r) => r.lh ?? '')),
    fetchLastSignalByPlate(),
  ])
  const rows = dayRaw.map((r) => assemble(r, enriched, signals, nowMs))
  // ordena: pendência primeiro, depois sem sinal, depois por horário
  rows.sort((a, b) => {
    const pa = a.pendencia ? 0 : 1
    const pb = b.pendencia ? 0 : 1
    if (pa !== pb) return pa - pb
    const sa = a.espelhamento.status === 'sem_sinal' ? 0 : 1
    const sb = b.espelhamento.status === 'sem_sinal' ? 0 : 1
    if (sa !== sb) return sa - sb
    return String(a.horario ?? '').localeCompare(String(b.horario ?? ''))
  })
  return { rows, syncedAt: snap.syncedAt }
}

/** Matriz de operação (default: hoje). */
export async function getSpxRows(scope: 'today' | 'tomorrow' = 'today', nowMs: number = Date.now()): Promise<SpxRow[]> {
  const date = scope === 'tomorrow' ? brtDate(1) : brtDate(0)
  return (await loadDay(date, nowMs)).rows
}

/** KPIs da operação (base = hoje BRT; programados = amanhã). */
export async function getSpxOverview(nowMs: number = Date.now()): Promise<SpxOverview> {
  const today = brtDate(0)
  const tomorrow = brtDate(1)
  const snap = await fetchShopeeSnapshot()

  const assignedFor = (date: string) => snap.rows.filter((r) => clean(r.data) === date && r.hasDriver === true)
  const { rows } = await loadDay(today, nowMs)
  const escalados = rows.filter((r) => r.hasDriver)

  return {
    date: today,
    escaladosHoje: escalados.length,
    programadosAmanha: assignedFor(tomorrow).length,
    frotasConformes: escalados.filter((r) => r.conforme).length,
    naoConforme: escalados.filter((r) => r.pendencia).length,
    semEspelhamento: escalados.filter((r) => r.espelhamento.status === 'sem_sinal').length,
    lastSyncAt: snap.syncedAt,
  }
}
