/**
 * Sync do PAINEL GAS (planilha de produção 1_SAEL3...) → trips (source='painel').
 *
 * Reproduz fielmente o getPainelData() do ScriptControleViagens:
 *   universo = aba "Carrega" (viagens ativas, c/ Cód. Viagem) + aba "HistoricoConcluidas" (concluídas).
 * Campos da Carrega (getDadosColunas): KM Total="Dist. Viagem", KM que Falta="Dist. Destino",
 *   Prazo Final="Previsão Chegada Destino", Partida="Saída Origem".
 * Status das ATIVAS é computado aqui com a lei do motorista (recalcularStatusLinhaLocal):
 *   chegou(kmFalta<=2)→concluída; ETA(=agora+horasViagem(kmFalta)) > prazo → ATRASADO, senão NO PRAZO.
 *
 * É público (gviz CSV, sem auth). Roda no cron → mantém o dashboard idêntico ao painel, ao vivo.
 */
import { sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db } from '../../db/client'
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

/** Parser CSV mínimo (aspas, vírgulas e quebras dentro de aspas). */
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
    else if (c === '\r') { /* skip */ }
    else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

function norm(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
function num(v: unknown): number | null {
  let x = String(v ?? '').toLowerCase().replace('km', '').trim()
  if (!x) return null
  if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(x)
  return isNaN(n) ? null : n
}
function isoDt(v: unknown): string | null {
  const m = String(v ?? '').replace(',', ' ').match(/(\d{2})\/(\d{2})\/(\d{4})\D+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] || '00'}`
}

async function fetchSheet(name: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`painel sheet ${name}: ${res.status}`)
  return parseCsv(await res.text())
}

function colFinder(headers: string[]) {
  const H = headers.map(norm)
  return (...names: string[]) => {
    for (const nm of names) { const i = H.indexOf(norm(nm)); if (i >= 0) return i }
    return -1
  }
}

interface TripRow {
  id: string; code: string; status: string; sla: string | null; progress: number
  distTotal: number | null; distDone: number | null; ws: string; we: string; eta: string | null
  adiant: number | null; origem: string | null; destino: string | null; motorista: string | null
}

export interface PainelSyncResult { ativas: number; concluidas: number; total: number; noPrazo: number; atrasadas: number }

export async function syncPainel(): Promise<PainelSyncResult> {
  const agora = new Date()
  const [carrega, concl] = await Promise.all([fetchSheet('Carrega'), fetchSheet('HistoricoConcluidas')])
  const recs: TripRow[] = []
  let noPrazo = 0, atrasadas = 0, ativasCount = 0

  // --- ATIVAS (Carrega) ---
  {
    const h = carrega[0] ?? []; const c = colFinder(h)
    const iCod = c('Cód. Viagem', 'COD. VIAGEM'), iKmT = c('Dist. Viagem', 'KM Total'),
      iKmF = c('Dist. Destino', 'KM que Falta'), iPz = c('Previsão Chegada Destino', 'Prazo Final'),
      iPart = c('Saída Origem', 'Partida Programada'), iCheg = c('Chegada Descarga'),
      iMot = c('Motorista'), iOri = c('Origem'), iDest = c('Destino')
    for (const r of carrega.slice(1)) {
      const cod = String(r[iCod] ?? '').trim()
      if (!cod) continue
      ativasCount++
      const kmT = num(r[iKmT]), kmF = num(r[iKmF])
      const prazoIso = isoDt(r[iPz]); const prazo = prazoIso ? new Date(prazoIso) : null
      const cheg = iCheg >= 0 ? isoDt(r[iCheg]) : null
      const kmFalta = kmF ?? 0
      const progress = (kmT && kmT > 0) ? Math.max(0, Math.min(100, Math.round(((kmT - kmFalta) / kmT) * 100))) : 0
      const ws = isoDt(r[iPart]) ?? agora.toISOString()
      const we = prazoIso ?? ws
      let status = 'in_progress', sla: string | null = null, eta: string | null = null, adiant: number | null = null
      if (cheg || kmFalta <= KM_CHEGOU || kmT == null || kmF == null || !prazo) {
        // concluída por chegada / chegou / dados insuficientes → não entra em No Prazo/Atrasadas
        if (cheg || kmFalta <= KM_CHEGOU) { status = 'completed' }
        eta = (kmFalta <= KM_CHEGOU) ? agora.toISOString() : null
      } else {
        const tRest = calcularHorasViagemComRegulamentacao(kmFalta, PARAMS_PADRAO)
        eta = Number.isFinite(tRest) ? new Date(agora.getTime() + tRest * 3600000).toISOString() : prazoIso
        const a = calcularAdiantamentoHoras(kmFalta, prazo, agora, 0, PARAMS_PADRAO)
        adiant = a == null ? null : -a
        if (adiant != null && adiant > 0) { sla = 'atrasado'; atrasadas++ } else { sla = 'no_prazo'; noPrazo++ }
      }
      recs.push({
        id: uuid5('painel|' + cod), code: ('PNL-' + cod).slice(0, 20), status, sla, progress,
        distTotal: kmT, distDone: (kmT != null) ? Math.max(0, kmT - kmFalta) : null, ws, we, eta, adiant,
        origem: String(r[iOri] ?? '').slice(0, 200) || null, destino: String(r[iDest] ?? '').slice(0, 200) || null,
        motorista: String(r[iMot] ?? '').trim() || null,
      })
    }
  }

  // --- CONCLUÍDAS (HistoricoConcluidas) ---
  {
    const h = concl[0] ?? []; const c = colFinder(h)
    const iCod = c('Cód. Viagem'), iMot = c('Motorista'), iOri = c('Origem'), iDest = c('Destino'),
      iPz = c('Prazo Final'), iKmT = c('KM Total'), iKmF = c('KM que Falta'), iConc = c('Data Conclusão')
    for (const r of concl.slice(1)) {
      const cod = String(r[iCod] ?? '').trim()
      if (!cod) continue
      const kmT = num(r[iKmT]), kmF = num(r[iKmF])
      const prazoIso = isoDt(r[iPz]); const concIso = iConc >= 0 ? isoDt(r[iConc]) : null
      const we = prazoIso ?? concIso ?? '2026-01-01T00:00:00'
      recs.push({
        id: uuid5('painel|' + cod), code: ('PNL-' + cod).slice(0, 20), status: 'completed', sla: null, progress: 100,
        distTotal: kmT, distDone: (kmT != null && kmF != null) ? Math.max(0, kmT - kmF) : kmT, ws: we, we,
        eta: concIso, adiant: null,
        origem: String(r[iOri] ?? '').slice(0, 200) || null, destino: String(r[iDest] ?? '').slice(0, 200) || null,
        motorista: String(r[iMot] ?? '').trim() || null,
      })
    }
  }

  // dedup por id (ativa tem prioridade sobre concluída de mesmo cod)
  const byId = new Map<string, TripRow>()
  for (const t of recs) { if (!byId.has(t.id) || t.status !== 'completed') byId.set(t.id, t) }
  const all = [...byId.values()]

  // Upsert do snapshot + remoção das que saíram da planilha. NÃO usa wipe-all (viagens podem ser
  // referenciadas por alerts via FK). Upsert marca updated_at=now(); o que não veio neste sync
  // (updated_at < syncStart) e não está referenciado por alerts é removido.
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

  const res = { ativas: ativasCount, concluidas: all.filter((t) => t.status === 'completed').length, total: all.length, noPrazo, atrasadas }
  logger.info(res, '[painel-sync] sincronizado com a planilha de produção')
  return res
}
