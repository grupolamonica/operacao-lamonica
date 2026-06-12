/**
 * Phase 15 — aba "asp" via HTTP (self-contained, sem sidecar).
 *
 * Reproduz a planilha "asp" (15 colunas) lendo as viagens linehaul direto da API
 * SPX. Os cookies de sessão vêm do `aspx_credentials` (id=1) da Supabase do Cargas
 * (a mesma que a Torre já lê — getCargasSupabase), mantidos pelo container
 * aspx-renewal. Só o cookie é necessário no GET /trip/list (verificado: app/
 * device-id/version são dispensáveis). `agency_current_station_id` é OBRIGATÓRIO.
 *
 * Une os 3 tabs por default — Planejado(1) ∪ Aceito(2) ∪ Concluído(3) — com dedupe
 * por trip_number (tab mais avançado vence). Resiliente: tab que falhar não derruba
 * os demais (vai pra `errors`). Cruzamento validado 2026-06-12 vs a aba: 15/15 colunas.
 */
import { getCargasSupabase } from '../../modules/cargas/cargas.supabase'

const SPX_BASE = (process.env.SPX_BASE_URL || 'https://logistics.myagencyservice.com.br').replace(/\/+$/, '')
const DEFAULT_STATION = process.env.SPX_LINEHAUL_STATION_ID || '5015'

// enum tt_trip_status (conf do portal SPX)
const TS: Record<number, string> = {
  0: 'Created', 4: 'Assigning', 5: 'Assigned', 10: 'Loading', 30: 'Seal',
  40: 'Departed', 50: 'Arrived', 60: 'Unseal', 70: 'Operating', 80: 'Unloaded',
  90: 'Completed', 100: 'Cancelled', 200: 'Pending',
}
// de-para Status SPX → Status Operacional (extraído da própria aba asp)
const OP: Record<string, string> = {
  Assigning: 'AGUARDANDO CHEGAR NO CLIENTE', Assigned: 'AGUARDANDO CHEGAR NO CLIENTE',
  Loading: 'AGUARDANDO CARREGAMENTO', Seal: 'AGUARDANDO CARREGAMENTO',
  Departed: 'CARREGADO', Arrived: 'AGUARDANDO DESCARGA', Unseal: 'DESCARREGANDO',
  Unloaded: 'DESCARREGADO', Completed: 'DESCARREGADO', Cancelled: 'CANCELADO',
}
const TAB_NAME: Record<number, string> = { 1: 'planejado', 2: 'aceito', 3: 'concluido' }

export const ASP_COLUMNS = [
  'LH Trip Number', 'LH Trip Name', 'Status', 'Status Operacional', 'Driver ID',
  'Vehicle', 'Vehicle Plate Number', 'Station_Origem', 'Station_Destino',
  'ETA ORIGEM PROGRAMADO', 'ETA ORIGEM REAL', 'CPT ORIGEM PROGRAMADO',
  'CPT ORIGEM REAL', 'ETA DESTINO PROGRAMADO', 'ETA DESTINO REAL',
] as const

export type AspRow = Record<(typeof ASP_COLUMNS)[number], string>

async function getCookieHeader(): Promise<string> {
  const sb = getCargasSupabase()
  const { data, error } = await sb
    .from('aspx_credentials')
    .select('cookies_json, cookies_expires_at')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw new Error(`aspx_credentials: ${error.message}`)
  const cookies = (data?.cookies_json ?? {}) as Record<string, string>
  const names = Object.keys(cookies)
  if (!names.length) {
    throw new Error('aspx_credentials.cookies_json vazio — o container aspx-renewal precisa renovar a sessão SPX')
  }
  return names.map((n) => `${n}=${cookies[n]}`).join('; ')
}

/** epoch (s, UTC) → 'DD/MM/YYYY HH:MM' em BRT (UTC-3); '' quando não setado (0). */
function tsToBr(ep: unknown): string {
  const n = Number(ep)
  if (!Number.isFinite(n) || n <= 1_000_000_000) return ''
  const d = new Date((n - 3 * 3600) * 1000)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

function stationLbl(s: any): string {
  return s?.station ? `[${s.station}]${s.station_name || ''}` : (s?.station_name || '')
}

function flatten(t: any): AspRow {
  const stns: any[] = t.trip_station ?? []
  const o = stns[0] ?? {}
  const d = stns[stns.length - 1] ?? {}
  const status = TS[t.trip_status as number] ?? String(t.trip_status)
  return {
    'LH Trip Number': t.trip_number ?? '',
    'LH Trip Name': t.trip_name ?? '',
    'Status': status,
    'Status Operacional': OP[status] ?? '',
    'Driver ID': t.driver ? `[${t.driver}]${t.driver_name || ''}` : '',
    'Vehicle': t.vehicle_type_name ?? '',
    'Vehicle Plate Number': (t.vehicle_plate_number_list ?? []).join(','),
    'Station_Origem': stationLbl(o),
    'Station_Destino': stationLbl(d),
    'ETA ORIGEM PROGRAMADO': tsToBr(o.sta),
    'ETA ORIGEM REAL': tsToBr(o.ata),
    'CPT ORIGEM PROGRAMADO': tsToBr(o.std),
    'CPT ORIGEM REAL': tsToBr(o.atd),
    'ETA DESTINO PROGRAMADO': tsToBr(d.sta),
    'ETA DESTINO REAL': tsToBr(d.ata),
  }
}

async function fetchTab(cookie: string, station: string, sta: string, queryType: number): Promise<any[]> {
  const all: any[] = []
  for (let page = 1; page <= 20; page++) {
    const url = `${SPX_BASE}/api/line_haul/agency/trip/list?pageno=${page}&count=200&query_type=${queryType}&sta=${sta}&agency_current_station_id=${encodeURIComponent(station)}`
    const r = await fetch(url, {
      headers: { Accept: 'application/json, text/plain, */*', Cookie: cookie, Origin: SPX_BASE, Referer: `${SPX_BASE}/` },
      signal: AbortSignal.timeout(60_000),
    })
    if (!r.ok) throw new Error(`SPX trip/list HTTP ${r.status}`)
    const j = (await r.json()) as { retcode?: number; message?: string; data?: { list?: any[] } }
    if (j.retcode !== 0) throw new Error(`SPX trip/list retcode ${j.retcode}: ${j.message || ''} (sessão SPX expirada? aspx-renewal renova)`)
    const lst = j.data?.list ?? []
    all.push(...lst)
    if (lst.length < 200) break
  }
  return all
}

export interface FetchAspOpts { daysBack?: number; daysFwd?: number; station?: string; queryTypes?: number[] }
export interface FetchAspResult { fetched: number; rows: AspRow[]; byTab: Record<string, number>; errors: { tab: string; error: string }[] }

export async function fetchAspRows(opts: FetchAspOpts = {}): Promise<FetchAspResult> {
  const cookie = await getCookieHeader()
  const station = opts.station || DEFAULT_STATION
  if (!station) throw new Error('agency_current_station_id ausente — defina SPX_LINEHAUL_STATION_ID ou passe ?station=')
  const now = Math.floor(Date.now() / 1000)
  const sta = `${now - (opts.daysBack ?? 45) * 86400},${now + (opts.daysFwd ?? 15) * 86400}`
  const qts = opts.queryTypes?.length ? opts.queryTypes : [1, 2, 3]

  const byTrip = new Map<string, any>() // dedupe por trip_number; tab mais avançado (ordem 1→3) vence
  const byTab: Record<string, number> = {}
  const errors: { tab: string; error: string }[] = []

  for (const qt of qts) {
    const tab = TAB_NAME[qt] ?? `qt${qt}`
    try {
      const trips = await fetchTab(cookie, station, sta, qt)
      byTab[tab] = trips.length
      for (const t of trips) if (t.trip_number) byTrip.set(t.trip_number, t)
    } catch (e) {
      byTab[tab] = 0
      errors.push({ tab, error: (e as Error)?.message ?? String(e) })
    }
  }

  // Se TODOS os tabs falharam, propaga o erro (não devolve vazio mascarando falha total).
  if (errors.length === qts.length) {
    throw new Error(`todas as consultas falharam: ${errors.map((e) => `${e.tab}=${e.error}`).join(' | ')}`)
  }

  return { fetched: byTrip.size, rows: [...byTrip.values()].map(flatten), byTab, errors }
}

export function aspRowsToCsv(rows: AspRow[]): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const head = ASP_COLUMNS.join(';')
  const body = rows.map((r) => ASP_COLUMNS.map((c) => esc(r[c] ?? '')).join(';')).join('\r\n')
  return '﻿' + head + '\r\n' + body
}
