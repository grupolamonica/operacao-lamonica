/**
 * Serviço da aba SPX / Shopee. Compõe a matriz por viagem a partir do nosso
 * banco (snapshot + enriched + driver_positions) e deriva os KPIs do dia.
 * Read-only.
 *
 * Regras portadas do PainelGR_mapa (planilha de liberação):
 *  - Perfil (motorista/cavalo/carreta): Apto|Vencido derivado da VALIDADE
 *    (dias = validade − hoje BRT; <0 = Vencido) — mesma fórmula IF(P<0) do doc.
 *  - Falha de lookup ("-", "#REF!", header vazado) NÃO é silenciada: vira
 *    "Não encontrado" e conta como pendência (o doc pinta de vermelho negrito).
 *  - Vazio legítimo (sem placa/motorista) segue neutro (null).
 *  - VINCULO com default TERCEIRO (o XLOOKUP do doc tem ;"TERCEIRO").
 *  - Espelhamento AL (col M): regra "vencido se < hoje" LIGADA, aguardando a
 *    ingestão carregar a data (hoje null → não pesa). Sinal (telemetria) é
 *    métrica informativa e NÃO entra na pendência.
 */
import { fetchShopeeSnapshot, fetchEnrichedByLh, fetchLastSignalByPlate, type RawSnapRow, type EnrichedRow } from './gr.spx.reads'
import { fetchOverridesByLh, type RowOverride } from './gr.override'
import type { SpxRow, SpxOverview, SpxSinal, SpxSource } from './gr.spx.types'

/** posição mais velha que isto (min) conta como "stale"; sem posição = sem_sinal. */
const SIGNAL_STALE_MIN = 180
const DAY_MS = 86_400_000

const norm = (s: string | null | undefined): string =>
  String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const normPlate = (s: string | null | undefined): string =>
  s ? String(s).toUpperCase().replace(/[^A-Z0-9]/g, '') : ''

/** Vazio legítimo → neutro (null): não há o que checar. */
const EMPTY = new Set(['', 'sem status', 'n/a', 'sem dado'])
/** Falha de lookup → "Não encontrado" (pendência; o doc acende vermelho negrito). */
const LOOKUP_FAIL = new Set(['-', '--', '#ref!', '#n/a', 'status', 'nao encontrado'])

const NAO_ENCONTRADO = 'Não encontrado'

/** Normaliza um texto da planilha: vazio → null; falha de lookup → "Não encontrado"; senão preserva
 *  (NUNCA muda casing aqui — placas e nomes ficam como vieram; o doc exige MAIÚSCULO). */
function sanitize(t: string | null | undefined): string | null {
  const raw = String(t ?? '').trim()
  const n = norm(raw)
  if (EMPTY.has(n)) return null
  if (LOOKUP_FAIL.has(n)) return NAO_ENCONTRADO
  return raw
}

/** Casing canônico SÓ p/ vocabulários de status (APROVADO → Aprovado). */
function canonStatus(t: string | null): string | null {
  if (!t || t === NAO_ENCONTRADO) return t
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t
}

const PERFIL_OK = new Set(['apto', 'conforme'])
const perfilBad = (t: string | null): boolean => t != null && !PERFIL_OK.has(norm(t))
const checklistBad = (t: string | null): boolean => t != null && norm(t) !== 'aprovado'

/** Data YYYY-MM-DD no fuso de Brasília, com offset em dias. */
function brtDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * DAY_MS)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

/** Dias entre uma data (YYYY-MM-DD…) e hoje BRT — mesma aritmética do doc (validade − TODAY()). */
function daysFromToday(dateLike: string | null | undefined, todayBrt: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateLike ?? ''))
  if (!m) return null
  const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(todayBrt)!
  const a = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const b = Date.UTC(Number(t[1]), Number(t[2]) - 1, Number(t[3]))
  return Math.round((a - b) / DAY_MS)
}

/**
 * Perfil Apto|Vencido derivado da validade (regra do doc); fallback no texto da
 * fonte; "Não encontrado" quando a entidade existe mas o lookup não achou.
 */
function derivePerfil(
  entityPresent: boolean,
  validUntil: string | null | undefined,
  statusText: string | null | undefined,
  found: boolean | null | undefined,
  todayBrt: string,
): { status: string | null; dias: number | null } {
  if (!entityPresent) return { status: null, dias: null }
  const dias = daysFromToday(validUntil, todayBrt)
  if (dias != null) return { status: dias < 0 ? 'Vencido' : 'Apto', dias }
  const txt = sanitize(statusText)
  if (txt) return { status: txt, dias: null }
  if (found === false) return { status: NAO_ENCONTRADO, dias: null }
  return { status: null, dias: null }
}

function sinalDe(cavalo: string | null, signals: Map<string, string>, nowMs: number): SpxSinal {
  const lastAt = signals.get(normPlate(cavalo)) ?? null
  if (!lastAt) return { lastAt: null, status: 'sem_sinal' }
  const ageMin = (nowMs - new Date(lastAt).getTime()) / 60_000
  return { lastAt, status: ageMin > SIGNAL_STALE_MIN ? 'stale' : 'ok' }
}

function assemble(
  r: RawSnapRow,
  enriched: Map<string, EnrichedRow>,
  signals: Map<string, string>,
  overrides: Map<string, RowOverride>,
  nowMs: number,
  todayBrt: string,
): SpxRow {
  const e = r.lh ? enriched.get(r.lh) : undefined
  const ov = r.lh ? overrides.get(r.lh) : undefined
  const motorista = sanitize(r.motoristas)
  const cavalo = sanitize(r.cavalo)
  const carreta = sanitize(r.carreta)

  const pm = derivePerfil(!!motorista, e?.angellira_driver_valid_until, null, e?.angellira_driver_found, todayBrt)
  const pc = derivePerfil(!!cavalo, e?.cavalo_angellira_valid_until, e?.cavalo_angellira_status_text, null, todayBrt)
  const pr = derivePerfil(!!carreta, e?.carreta_angellira_valid_until, e?.carreta_angellira_status_text, null, todayBrt)

  const checklistCavalo = cavalo ? canonStatus(sanitize(r.checklistCavalo)) : null
  const checklistCarreta = carreta ? canonStatus(sanitize(r.checklistCarreta)) : null

  // Espelhamento AL (col M do doc): a regra está ligada; o dado depende da ingestão.
  const espelhamentoAlDate = r.espelhamentoAl ? String(r.espelhamentoAl).slice(0, 10) : null
  const alDias = daysFromToday(espelhamentoAlDate, todayBrt)
  const espelhamentoAlVencido = alDias != null && alDias < 0

  const pendencia =
    perfilBad(pm.status) || perfilBad(pc.status) || perfilBad(pr.status) ||
    checklistBad(checklistCavalo) || checklistBad(checklistCarreta) ||
    espelhamentoAlVencido

  return {
    lh: r.lh ?? '',
    data: sanitize(r.data),
    horario: r.horario ? String(r.horario).slice(0, 5) : null,
    tipo: sanitize(r.tipo),
    vinculo: sanitize(r.vinculo) ?? 'TERCEIRO', // default do XLOOKUP do doc
    motorista,
    cpf: e?.aspx_cpf ?? null,
    cavalo,
    carreta,
    origem: sanitize(r.origem),
    destino: sanitize(r.destino),
    statusViagem: sanitize(r.status),
    perfilMotorista: pm.status,
    perfilMotoristaDias: pm.dias,
    perfilCavalo: pc.status,
    perfilCavaloDias: pc.dias,
    perfilCarreta: pr.status,
    perfilCarretaDias: pr.dias,
    checklistCavalo,
    checklistCarreta,
    checklistCavaloDias: typeof r.checklistCavaloVenc === 'number' ? r.checklistCavaloVenc : null,
    checklistCarretaDias: typeof r.checklistCarretaVenc === 'number' ? r.checklistCarretaVenc : null,
    espelhamentoAlDate,
    espelhamentoAlVencido,
    sinal: sinalDe(cavalo, signals, nowMs),
    hasDriver: r.hasDriver === true,
    isAvailable: r.isAvailable === true,
    override: ov ? { liberado: ov.liberado, observacao: ov.observacao, updatedAt: ov.updatedAt } : null,
    pendencia,
    // conforme EFETIVO: liberação manual (auditada) sobrepõe o gate calculado — como
    // os dropdowns editáveis da planilha.
    conforme: ov?.liberado === true ? true : !pendencia,
  }
}

/** Monta as linhas da matriz para uma data (YYYY-MM-DD). Retorna também o snapshot
 *  (uma leitura só) para o overview reaproveitar sem refetch. */
async function loadDay(source: SpxSource, date: string, nowMs: number) {
  const snap = await fetchShopeeSnapshot(source)
  const todayBrt = brtDate(0)
  // descarta ruído de planilha (linha sem lh): dado inválido + evita key React duplicada
  const dayRaw = snap.rows.filter((r) => sanitize(r.data) === date && !!r.lh?.trim())
  const [enriched, signals, overrides] = await Promise.all([
    fetchEnrichedByLh(dayRaw.map((r) => r.lh ?? '')),
    fetchLastSignalByPlate(),
    fetchOverridesByLh(dayRaw.map((r) => r.lh ?? '')),
  ])
  const rows = dayRaw.map((r) => assemble(r, enriched, signals, overrides, nowMs, todayBrt))
  // ordena: não-conforme EFETIVO primeiro (liberado manual desce), depois sem sinal, depois horário
  rows.sort((a, b) => {
    const pa = a.conforme ? 1 : 0
    const pb = b.conforme ? 1 : 0
    if (pa !== pb) return pa - pb
    const sa = a.sinal.status === 'sem_sinal' ? 0 : 1
    const sb = b.sinal.status === 'sem_sinal' ? 0 : 1
    if (sa !== sb) return sa - sb
    return String(a.horario ?? '').localeCompare(String(b.horario ?? ''))
  })
  return { rows, snap }
}

/** Matriz de operação (default: hoje, Shopee). */
export async function getSpxRows(
  scope: 'today' | 'tomorrow' = 'today',
  source: SpxSource = 'shopee',
  nowMs: number = Date.now(),
): Promise<SpxRow[]> {
  const date = scope === 'tomorrow' ? brtDate(1) : brtDate(0)
  return (await loadDay(source, date, nowMs)).rows
}

/** KPIs da operação (base = hoje BRT; programados = amanhã). Uma leitura de snapshot. */
export async function getSpxOverview(source: SpxSource = 'shopee', nowMs: number = Date.now()): Promise<SpxOverview> {
  const today = brtDate(0)
  const tomorrow = brtDate(1)
  const { rows, snap } = await loadDay(source, today, nowMs)
  const escalados = rows.filter((r) => r.hasDriver)

  return {
    source,
    date: today,
    escaladosHoje: escalados.length,
    programadosAmanha: snap.rows.filter((r) => sanitize(r.data) === tomorrow && r.hasDriver === true && !!r.lh?.trim()).length,
    frotasConformes: escalados.filter((r) => r.conforme).length,
    naoConforme: escalados.filter((r) => !r.conforme).length,
    semSinal: escalados.filter((r) => r.sinal.status === 'sem_sinal').length,
    lastSyncAt: snap.syncedAt,
  }
}
