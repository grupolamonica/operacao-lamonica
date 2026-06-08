/**
 * Sync do PAINEL GAS (planilha de produção 1_SAEL3...) → trips (source='painel') + Redis (tickets/alertas).
 *
 * Reproduz fielmente getPainelData() + updateDashboardSummary() do ScriptControleViagens:
 *   universo = aba "Carrega" (ativas, c/ Cód. Viagem) + "HistoricoConcluidas" (concluídas).
 *   O painel faz [...ativas, ...concluídas] SEM deduplicar → uma viagem em ambas conta 2× (replicamos
 *   com ids distintos: PNLA-<cod> ativa / PNLC-<cod> concluída) para o Total bater com o painel.
 * Campos da Carrega: KM Total="Dist. Viagem", KM que Falta="Dist. Destino",
 *   Prazo Final="Previsão Chegada Destino", Partida="Saída Origem".
 * Status das ATIVAS = lei do motorista (recalcularStatusLinhaLocal): chegou(kmFalta<=2)→concluída;
 *   ETA(=agora+horasViagem(kmFalta)) > prazo → ATRASADO, senão NO PRAZO.
 * Tickets Pendentes = nº de tickets ABERTO/EM_TRATAMENTO (aba HistoricoTickets) das viagens ATIVAS.
 * Alertas = viagens ativas com PARADA aberta recente (proxy de "parado >30min"). Guardados no Redis.
 */
import { sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db } from '../../db/client'
import { redis } from '../../redis/client'
import { logger } from '../../lib/logger'
import { calcularHorasViagemComRegulamentacao, calcularAdiantamentoHoras, PARAMS_PADRAO } from '../../lib/regulamentacao'

const SHEET_ID = process.env.PAINEL_SHEET_ID || '1_SAEL3Dd2y-dJyNdckvC53qS1F0Lezgk7MAFs0BEsPs'
const KM_CHEGOU = PARAMS_PADRAO.kmParaConsiderarChegou

function uuid5(name: string): string {
  const NS = '6ba7b8109dad11d180b400c04fd430c8'
  const h = createHash('sha1').update(Buffer.from(NS, 'hex')).update(name).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}
const norm = (s: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
function num(v: unknown): number | null {
  let x = String(v ?? '').toLowerCase().replace('km', '').trim()
  if (!x) return null
  if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(x); return isNaN(n) ? null : n
}
function isoDt(v: unknown): string | null {
  const m = String(v ?? '').replace(',', ' ').match(/(\d{2})\/(\d{2})\/(\d{4})\D+(\d{2}):(\d{2})(?::(\d{2}))?/)
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] || '00'}` : null
}
function dateBR(v: unknown): Date | null { const i = isoDt(v); return i ? new Date(i) : null }

async function fetchSheet(name: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`painel sheet ${name}: ${res.status}`)
  return parseCsv(await res.text())
}
function colFinder(headers: string[]) {
  const H = headers.map(norm)
  return (...names: string[]) => { for (const nm of names) { const i = H.indexOf(norm(nm)); if (i >= 0) return i } return -1 }
}

interface TripRow {
  id: string; code: string; status: string; sla: string | null; progress: number
  distTotal: number | null; distDone: number | null; ws: string; we: string; eta: string | null
  adiant: number | null; origem: string | null; destino: string | null; motorista: string | null
}
export interface PainelSyncResult { ativas: number; concluidas: number; total: number; noPrazo: number; atrasadas: number; ticketsPendentes: number; alertas: number }

export async function syncPainel(): Promise<PainelSyncResult> {
  const agora = new Date()
  const [carrega, concl, tickets] = await Promise.all([
    fetchSheet('Carrega'), fetchSheet('HistoricoConcluidas'), fetchSheet('HistoricoTickets'),
  ])
  const recs: TripRow[] = []
  let noPrazo = 0, atrasadas = 0
  const activeCods = new Set<string>()

  // --- ATIVAS (Carrega) ---
  {
    const h = carrega[0] ?? []; const c = colFinder(h)
    const iCod = c('Cód. Viagem'), iKmT = c('Dist. Viagem', 'KM Total'), iKmF = c('Dist. Destino', 'KM que Falta'),
      iPz = c('Previsão Chegada Destino', 'Prazo Final'), iPart = c('Saída Origem', 'Partida Programada'),
      iCheg = c('Chegada Descarga'), iMot = c('Motorista'), iOri = c('Origem'), iDest = c('Destino')
    for (const r of carrega.slice(1)) {
      const cod = String(r[iCod] ?? '').trim(); if (!cod) continue
      const kmT = num(r[iKmT]), kmF = num(r[iKmF]); const prazoIso = isoDt(r[iPz]); const prazo = prazoIso ? new Date(prazoIso) : null
      const cheg = iCheg >= 0 ? isoDt(r[iCheg]) : null; const kmFalta = kmF ?? 0
      const progress = (kmT && kmT > 0) ? Math.max(0, Math.min(100, Math.round(((kmT - kmFalta) / kmT) * 100))) : 0
      const ws = isoDt(r[iPart]) ?? agora.toISOString(); const we = prazoIso ?? ws
      let status = 'in_progress', sla: string | null = null, eta: string | null = null, adiant: number | null = null
      if (cheg || kmFalta <= KM_CHEGOU || kmT == null || kmF == null || !prazo) {
        if (cheg || kmFalta <= KM_CHEGOU) status = 'completed'
        eta = (kmFalta <= KM_CHEGOU) ? agora.toISOString() : null
      } else {
        activeCods.add(cod)
        const tRest = calcularHorasViagemComRegulamentacao(kmFalta, PARAMS_PADRAO)
        eta = Number.isFinite(tRest) ? new Date(agora.getTime() + tRest * 3600000).toISOString() : prazoIso
        const a = calcularAdiantamentoHoras(kmFalta, prazo, agora, 0, PARAMS_PADRAO)
        adiant = a == null ? null : -a
        if (adiant != null && adiant > 0) { sla = 'atrasado'; atrasadas++ } else { sla = 'no_prazo'; noPrazo++ }
      }
      recs.push({ id: uuid5('painel|a|' + cod), code: ('PNLA-' + cod).slice(0, 20), status, sla, progress,
        distTotal: kmT, distDone: (kmT != null) ? Math.max(0, kmT - kmFalta) : null, ws, we, eta, adiant,
        origem: String(r[iOri] ?? '').slice(0, 200) || null, destino: String(r[iDest] ?? '').slice(0, 200) || null,
        motorista: String(r[iMot] ?? '').trim() || null })
    }
  }

  // --- CONCLUÍDAS (HistoricoConcluidas) — id distinto (double-count igual ao painel) ---
  {
    const h = concl[0] ?? []; const c = colFinder(h)
    const iCod = c('Cód. Viagem'), iMot = c('Motorista'), iOri = c('Origem'), iDest = c('Destino'),
      iPz = c('Prazo Final'), iKmT = c('KM Total'), iKmF = c('KM que Falta'), iConc = c('Data Conclusão')
    for (const r of concl.slice(1)) {
      const cod = String(r[iCod] ?? '').trim(); if (!cod) continue
      const kmT = num(r[iKmT]), kmF = num(r[iKmF]); const prazoIso = isoDt(r[iPz]); const concIso = iConc >= 0 ? isoDt(r[iConc]) : null
      const we = prazoIso ?? concIso ?? '2026-01-01T00:00:00'
      recs.push({ id: uuid5('painel|c|' + cod), code: ('PNLC-' + cod).slice(0, 20), status: 'completed', sla: null, progress: 100,
        distTotal: kmT, distDone: (kmT != null && kmF != null) ? Math.max(0, kmT - kmF) : kmT, ws: we, we, eta: concIso, adiant: null,
        origem: String(r[iOri] ?? '').slice(0, 200) || null, destino: String(r[iDest] ?? '').slice(0, 200) || null,
        motorista: String(r[iMot] ?? '').trim() || null })
    }
  }

  // --- TICKETS PENDENTES + ALERTAS (HistoricoTickets) sobre as viagens ATIVAS ---
  let ticketsPendentes = 0; const alertaCods = new Set<string>()
  {
    const h = tickets[0] ?? []; const c = colFinder(h)
    const iCod = c('Cód. Viagem'), iTipo = c('Tipo'), iStatus = c('Status'), iAbert = c('Timestamp Abertura')
    const limiteParada = agora.getTime() - 2 * 3600000  // PARADA aberta nas últimas 2h ≈ parado agora
    for (const r of tickets.slice(1)) {
      const cod = String(r[iCod] ?? '').trim(); if (!cod || !activeCods.has(cod)) continue
      const stt = String(r[iStatus] ?? '').trim(); const tipo = String(r[iTipo] ?? '').trim()
      if ((stt !== 'ABERTO' && stt !== 'EM_TRATAMENTO') || tipo === '1H_INTERVALO') continue
      ticketsPendentes++
      if (tipo === 'PARADA') { const ab = dateBR(r[iAbert]); if (!ab || ab.getTime() >= limiteParada) alertaCods.add(cod) }
    }
  }
  const alertas = alertaCods.size

  // dedup só por id (PNLA-/PNLC- são distintos → double-count mantido; remove cods repetidos na mesma aba)
  const byId = new Map<string, TripRow>(); for (const t of recs) byId.set(t.id, t)
  const all = [...byId.values()]
  const syncStart = agora.toISOString()
  await db.transaction(async (tx) => {
    const B = 500
    for (let i = 0; i < all.length; i += B) {
      const batch = all.slice(i, i + B)
      const values = batch.map((t) => sql`(${t.id}, ${t.code}, 'painel', 'media', ${t.origem}, ${t.destino},
        ${t.ws}, ${t.we}, ${t.eta}, ${t.status}, ${t.sla}, ${t.progress},
        ${t.distTotal != null ? String(t.distTotal) : null}, ${t.distDone != null ? String(t.distDone) : null},
        ${t.adiant != null ? String(t.adiant) : null}, ${t.motorista}, 'intensivo', now(), now())`)
      await tx.execute(sql`
        INSERT INTO trips (id, code, source, priority, origin, destination, window_start, window_end, eta,
          status, sla_status, progress_pct, distance_total, distance_done, adiantamento_horas,
          sheet_motorista, conducao_regime, created_at, updated_at)
        VALUES ${sql.join(values, sql`, `)}
        ON CONFLICT (id) DO UPDATE SET
          code=EXCLUDED.code, origin=EXCLUDED.origin, destination=EXCLUDED.destination,
          window_start=EXCLUDED.window_start, window_end=EXCLUDED.window_end, eta=EXCLUDED.eta,
          status=EXCLUDED.status, sla_status=EXCLUDED.sla_status, progress_pct=EXCLUDED.progress_pct,
          distance_total=EXCLUDED.distance_total, distance_done=EXCLUDED.distance_done,
          adiantamento_horas=EXCLUDED.adiantamento_horas, sheet_motorista=EXCLUDED.sheet_motorista, updated_at=now()
      `)
    }
    await tx.execute(sql`
      DELETE FROM trips WHERE source='painel' AND updated_at < ${syncStart}
        AND id NOT IN (SELECT trip_id FROM alerts WHERE trip_id IS NOT NULL)
    `)
  })

  // Tickets/Alertas para o dashboard (Redis — lidos pelo getDashboardKpis)
  try { await redis.set('painel:tickets', JSON.stringify({ ticketsPendentes, alertas }), 'EX', 1800) } catch { /* noop */ }

  const res: PainelSyncResult = { ativas: activeCods.size, concluidas: all.filter((t) => t.status === 'completed').length, total: all.length, noPrazo, atrasadas, ticketsPendentes, alertas }
  logger.info(res, '[painel-sync] sincronizado com a planilha de produção')
  return res
}
