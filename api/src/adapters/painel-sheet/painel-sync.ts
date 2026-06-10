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

export function parseCsv(text: string): string[][] {
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

export async function fetchSheet(name: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`painel sheet ${name}: ${res.status}`)
  return parseCsv(await res.text())
}
export function colFinder(headers: string[]) {
  const H = headers.map(norm)
  return (...names: string[]) => { for (const nm of names) { const i = H.indexOf(norm(nm)); if (i >= 0) return i } return -1 }
}

interface TripRow {
  id: string; code: string; status: string; sla: string | null; progress: number
  distTotal: number | null; distDone: number | null; ws: string; we: string; eta: string | null
  adiant: number | null; origem: string | null; destino: string | null; motorista: string | null
  lh: string | null  // Phase 14 — LH (numViagem) p/ cruzar com Cargas
}
export interface PainelSyncResult { ativas: number; concluidas: number; total: number; noPrazo: number; atrasadas: number; ticketsPendentes: number; alertas: number }

export async function syncPainel(): Promise<PainelSyncResult> {
  const agora = new Date()
  // Abas LEVES (Carrega ~600 + HistoricoConcluidas ~5k + LogObservacoes) toda execução.
  const [carrega, concl, logObs] = await Promise.all([
    fetchSheet('Carrega'), fetchSheet('HistoricoConcluidas'), fetchSheet('LogObservacoes').catch(() => [] as string[][]),
  ])

  // Phase 14 (D-14) — cod (Cód. Viagem) → LH (numViagem) do LogObservacoes, p/ cruzar com o Cargas.
  // Mesmo código Shopee (LT + 11). col A=Cód.Viagem, B=Observação, C=numViagem (DOC ScriptControleViagens).
  const LH_RE = /(LT[A-Z0-9]{11})/i
  const codToLh = new Map<string, string>()
  {
    const h = logObs[0] ?? []; const cf = colFinder(h)
    let iCod = cf('Cód. Viagem', 'Cod. Viagem', 'Codigo Viagem'); if (iCod < 0) iCod = 0
    let iLh  = cf('numViagem', 'num Viagem', 'LH', 'Numero Viagem'); if (iLh < 0) iLh = 2
    const headerLooksData = LH_RE.test(String(h[iLh] ?? '')) || LH_RE.test(String(h[1] ?? ''))
    for (const r of (headerLooksData ? logObs : logObs.slice(1))) {
      const cod = String(r[iCod] ?? '').trim(); if (!cod) continue
      let lh = String(r[iLh] ?? '').trim()
      if (!LH_RE.test(lh)) { const m = String(r[1] ?? '').match(LH_RE); lh = m ? m[1] : '' }
      const m2 = lh.match(LH_RE); if (m2) codToLh.set(cod, m2[1].toUpperCase())
    }
  }
  // HistoricoConcluidas também traz o LH direto (col "numViagem (Log)") — cobre onde o
  // LogObservacoes não tem linha (entradas recentes vêm sem LH lá).
  {
    const h = concl[0] ?? []; const cf = colFinder(h)
    const iCod = cf('Cód. Viagem'); const iLh = cf('numViagem (Log)', 'numViagem', 'num Viagem')
    if (iCod >= 0 && iLh >= 0) {
      for (const r of concl.slice(1)) {
        const cod = String(r[iCod] ?? '').trim(); if (!cod || codToLh.has(cod)) continue
        const m = String(r[iLh] ?? '').match(LH_RE); if (m) codToLh.set(cod, m[1].toUpperCase())
      }
    }
  }

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
        motorista: String(r[iMot] ?? '').trim() || null, lh: codToLh.get(cod) ?? null })
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
        motorista: String(r[iMot] ?? '').trim() || null, lh: codToLh.get(cod) ?? null })
    }
  }

  // --- TICKETS PENDENTES + ALERTAS (HistoricoTickets, 75k linhas = aba PESADA) ---
  // Para NÃO sobrecarregar a planilha (compartilhada com o painel GAS), só baixamos HistoricoTickets
  // no máximo a cada ~30min; entre isso reusamos o último valor do Redis. Tickets mudam devagar.
  let ticketsPendentes = 0, alertas = 0, ticketsFresco = false
  let prevTs = 0
  // Phase 14 — paradas (HistoricodeParadas) p/ a linha do tempo (só paradas + região = Posição).
  const paradaRows: Array<{ cod: string; posicao: string; inicio: string | null; dur: string }> = []
  try {
    const prev = await redis.get('painel:tickets')
    if (prev) { const o = JSON.parse(prev); ticketsPendentes = Number(o.ticketsPendentes ?? 0); alertas = Number(o.alertas ?? 0); prevTs = Number(o.ts ?? 0) }
  } catch { /* noop */ }

  if (agora.getTime() - prevTs >= 28 * 60000) {
    const tickets = await fetchSheet('HistoricoTickets')
    const h = tickets[0] ?? []; const c = colFinder(h)
    const iCod = c('Cód. Viagem'), iTipo = c('Tipo'), iStatus = c('Status'), iAbert = c('Timestamp Abertura')
    const iOp = c('Operador'), iObs = c('Observação'), iTrat = c('Timestamp Tratamento')
    const iEmb = c('Procedimento Embarque', 'Procedimento de Embarque'), iMot = c('Motorista'), iDst = c('Destino')
    // Phase 14 — campos do ticket do painel (HistoricoTickets) p/ Ocorrências bater com o painel.
    const iAtraso = c('Atraso (HH:MM)', 'Atraso'), iKm = c('KM Restante', 'Km Restante'), iPlaca = c('Placa'), iOri = c('Origem')
    const limiteParada = agora.getTime() - 2 * 3600000
    let tp = 0; const alertaCods = new Set<string>()
    // Dedup por episódio (cod|tipo) — mantém a ocorrência mais recente (igual ao "último ticket" do painel).
    const epis = new Map<string, { cod: string; tipo: string; stt: string; ab: string | null; op: string; obs: string; trat: string | null; emb: string; mot: string; dst: string; atraso: string; km: string; placa: string; ori: string }>()
    for (const r of tickets.slice(1)) {
      const cod = String(r[iCod] ?? '').trim(); const tipo = String(r[iTipo] ?? '').trim()
      if (!cod || tipo === '1H_INTERVALO') continue
      const stt = String(r[iStatus] ?? '').trim()
      // contagem de pendentes/alertas (só viagens ativas), como antes
      if ((stt === 'ABERTO' || stt === 'EM_TRATAMENTO') && activeCods.has(cod)) {
        tp++
        if (tipo === 'PARADA') { const a = dateBR(r[iAbert]); if (!a || a.getTime() >= limiteParada) alertaCods.add(cod) }
      }
      const ab = isoDt(r[iAbert]); const key = cod + '|' + tipo
      const prev = epis.get(key)
      if (!prev || (ab && prev.ab && ab > prev.ab) || (ab && !prev.ab)) {
        epis.set(key, { cod, tipo, stt, ab, op: String(r[iOp] ?? '').trim(), obs: String(r[iObs] ?? '').trim(),
          trat: isoDt(r[iTrat]), emb: String(r[iEmb] ?? '').trim(), mot: String(r[iMot] ?? '').trim(), dst: String(r[iDst] ?? '').trim(),
          atraso: iAtraso >= 0 ? String(r[iAtraso] ?? '').trim() : '', km: iKm >= 0 ? String(r[iKm] ?? '').trim() : '',
          placa: iPlaca >= 0 ? String(r[iPlaca] ?? '').trim() : '', ori: iOri >= 0 ? String(r[iOri] ?? '').trim() : '' })
      }
    }
    ticketsPendentes = tp; alertas = alertaCods.size; ticketsFresco = true

    // --- Importa os episódios como ALERTS (Ocorrências): abertos + tratados (histórico) ---
    // tripId casa com a viagem Angellira numérica (uuid5('carrega|'+cod)) quando existe; senão null.
    const tripIds = new Set<string>(((await db.execute(sql`SELECT id FROM trips`)) as unknown as Array<{ id: string }>).map((r) => r.id))
    const SEV: Record<string, string> = { PARADA: 'medio', SEM_GPS: 'critico', ATRASO: 'medio', PRAZO_PROXIMO: 'baixo', PROXIMO_ENTREGA: 'baixo', OK: 'baixo' }
    const STATUS: Record<string, string> = { ABERTO: 'aberto', EM_TRATAMENTO: 'em_tratativa', FECHADO: 'resolvido' }
    const arows = [...epis.values()].map((e) => {
      const tid = uuid5('carrega|' + e.cod)
      const obs = e.obs ? e.obs.slice(0, 400) : ''
      const desc = [`Cliente: ${e.emb || '—'}`, `Viagem ${e.cod}`, obs, e.op ? `Operador: ${e.op}` : '']
        .filter(Boolean).join(' · ')
      const painelMeta = {
        atraso: e.atraso || undefined, kmRestante: e.km || undefined, placa: e.placa || undefined,
        origem: e.ori || undefined, destino: e.dst || undefined, operador: e.op || undefined, embarque: e.emb || undefined,
      }
      return {
        id: uuid5('ticket|' + e.cod + '|' + e.tipo),
        type: e.tipo.toLowerCase().slice(0, 50),
        severity: SEV[e.tipo] ?? 'baixo',
        status: STATUS[e.stt] ?? 'aberto',
        tripId: tripIds.has(tid) ? tid : null,
        title: `${e.tipo} · ${e.mot || 'motorista'}`.slice(0, 150),
        description: desc.slice(0, 1000),
        source: 'Painel',
        occurredAt: e.ab ?? agora.toISOString(),
        resolvedAt: e.stt === 'FECHADO' ? (e.trat ?? e.ab) : null,
        painelMeta: JSON.stringify(painelMeta),
      }
    })
    await db.transaction(async (tx) => {
      const B = 500
      for (let i = 0; i < arows.length; i += B) {
        const batch = arows.slice(i, i + B)
        const vals = batch.map((a) => sql`(${a.id}, ${a.type}, ${a.severity}, ${a.status}, 'media', ${a.tripId},
          ${a.title}, ${a.description}, ${a.source}, ${a.occurredAt}, ${a.resolvedAt}, ${a.painelMeta}::jsonb, now())`)
        await tx.execute(sql`
          INSERT INTO alerts (id, type, severity, status, priority, trip_id, title, description, source, occurred_at, resolved_at, painel_meta, created_at)
          VALUES ${sql.join(vals, sql`, `)}
          ON CONFLICT (id) DO UPDATE SET
            status=EXCLUDED.status, description=EXCLUDED.description, resolved_at=EXCLUDED.resolved_at,
            trip_id=COALESCE(EXCLUDED.trip_id, alerts.trip_id), painel_meta=EXCLUDED.painel_meta
        `)
      }
    })
    logger.info({ episodios: arows.length, ticketsPendentes, alertas }, '[painel-sync] tickets->alerts importados')

    // Phase 14 — paradas → buffer (vira trip_events 'stopped' depois do upsert de trips, p/ FK válido).
    try {
      const par = await fetchSheet('HistoricodeParadas')
      const ph = par[0] ?? []; const pc = colFinder(ph)
      const pCod = pc('Cód. Viagem'), pPos = pc('Posição'), pIni = pc('Início da Parada', 'Inicio da Parada'), pDur = pc('Duração Total', 'Duracao Total')
      for (const r of par.slice(1)) {
        const cod = String(r[pCod] ?? '').trim(); const pos = String(r[pPos] ?? '').trim()
        if (!cod || !pos) continue
        paradaRows.push({ cod, posicao: pos.slice(0, 300), inicio: isoDt(r[pIni]), dur: String(r[pDur] ?? '').trim() })
      }
      logger.info({ paradas: paradaRows.length }, '[painel-sync] paradas lidas')
    } catch { /* paradas best-effort */ }
  }

  // dedup só por id (PNLA-/PNLC- são distintos → double-count mantido; remove cods repetidos na mesma aba)
  const byId = new Map<string, TripRow>(); for (const t of recs) byId.set(t.id, t)
  const all = [...byId.values()]
  // Phase 14 — sheet_lh é ÚNICO (uq_trips_sheet_lh). O painel duplica (PNLA ativo + PNLC concluído
  // do mesmo cód → mesmo LH): mantém o LH só no 1º registro por LH (ativo vem antes → ganha), zera o resto.
  const seenLh = new Set<string>()
  for (const t of all) { if (t.lh) { if (seenLh.has(t.lh)) t.lh = null; else seenLh.add(t.lh) } }
  const lhList = [...seenLh]
  const syncStart = agora.toISOString()
  await db.transaction(async (tx) => {
    // Reivindica do Cargas os LHs que agora estão ao vivo no painel (painel = fonte ao vivo).
    if (lhList.length > 0) {
      for (let i = 0; i < lhList.length; i += 1000) {
        const chunk = lhList.slice(i, i + 1000)
        await tx.execute(sql`DELETE FROM trips WHERE source='cargas' AND sheet_lh IN (${sql.join(chunk.map((l) => sql`${l}`), sql`, `)})`)
      }
      // uq_trips_sheet_lh é global: NÃO reivindica um LH que já pertence a OUTRO trip (ex. histórico
      // source=null). Mantém o LH só se ninguém mais tem, ou se o dono já é o próprio trip do painel.
      const ownerByLh = new Map<string, string>()
      for (let i = 0; i < lhList.length; i += 1000) {
        const chunk = lhList.slice(i, i + 1000)
        const rows = (await tx.execute(sql`SELECT sheet_lh, id FROM trips WHERE sheet_lh IN (${sql.join(chunk.map((l) => sql`${l}`), sql`, `)})`)) as unknown as Array<{ sheet_lh: string; id: string }>
        for (const r of rows) ownerByLh.set(String(r.sheet_lh).toUpperCase(), r.id)
      }
      for (const t of all) {
        if (t.lh) { const o = ownerByLh.get(t.lh.toUpperCase()); if (o && o !== t.id) t.lh = null }
      }
    }
    const B = 500
    for (let i = 0; i < all.length; i += B) {
      const batch = all.slice(i, i + B)
      const values = batch.map((t) => sql`(${t.id}, ${t.code}, 'painel', 'media', ${t.origem}, ${t.destino},
        ${t.ws}, ${t.we}, ${t.eta}, ${t.status}, ${t.sla}, ${t.progress},
        ${t.distTotal != null ? String(t.distTotal) : null}, ${t.distDone != null ? String(t.distDone) : null},
        ${t.adiant != null ? String(t.adiant) : null}, ${t.motorista}, ${t.lh}, 'intensivo', now(), now())`)
      await tx.execute(sql`
        INSERT INTO trips (id, code, source, priority, origin, destination, window_start, window_end, eta,
          status, sla_status, progress_pct, distance_total, distance_done, adiantamento_horas,
          sheet_motorista, sheet_lh, conducao_regime, created_at, updated_at)
        VALUES ${sql.join(values, sql`, `)}
        ON CONFLICT (id) DO UPDATE SET
          code=EXCLUDED.code, origin=EXCLUDED.origin, destination=EXCLUDED.destination,
          window_start=EXCLUDED.window_start, window_end=EXCLUDED.window_end, eta=EXCLUDED.eta,
          status=EXCLUDED.status, sla_status=EXCLUDED.sla_status, progress_pct=EXCLUDED.progress_pct,
          distance_total=EXCLUDED.distance_total, distance_done=EXCLUDED.distance_done,
          adiantamento_horas=EXCLUDED.adiantamento_horas, sheet_motorista=EXCLUDED.sheet_motorista,
          sheet_lh=COALESCE(EXCLUDED.sheet_lh, trips.sheet_lh), updated_at=now()
      `)
    }
    await tx.execute(sql`
      DELETE FROM trips WHERE source='painel' AND updated_at < ${syncStart}
        AND id NOT IN (SELECT trip_id FROM alerts WHERE trip_id IS NOT NULL)
    `)
  })

  // Phase 14 — paradas → trip_events 'stopped' (linha do tempo só paradas + região=Posição).
  // Liga ao trip do painel pelo cód (PNLA ativo tem preferência). FK válido pós-upsert de trips.
  if (paradaRows.length > 0) {
    const codToTrip = new Map<string, string>()
    for (const t of all) {
      const m = t.code.match(/^PNL([AC])-(.+)$/)
      if (m) { const cod = m[2]; if (m[1] === 'A' || !codToTrip.has(cod)) codToTrip.set(cod, t.id) }
    }
    const evsRaw = paradaRows
      .filter((p) => codToTrip.has(p.cod))
      .map((p) => ({
        id: uuid5('parada|' + p.cod + '|' + (p.inicio ?? '')),
        tripId: codToTrip.get(p.cod)!,
        notes: (p.dur ? `${p.posicao} · ${p.dur}` : p.posicao).slice(0, 500),
        occurredAt: p.inicio ?? syncStart,
      }))
    // dedup por id (cod+inicio iguais → mesmo uuid5; ON CONFLICT não aceita 2x na mesma INSERT)
    const evs = [...new Map(evsRaw.map((e) => [e.id, e])).values()]
    await db.transaction(async (tx) => {
      const B = 500
      for (let i = 0; i < evs.length; i += B) {
        const batch = evs.slice(i, i + B)
        const vals = batch.map((e) => sql`(${e.id}, ${e.tripId}, 'stopped', ${e.occurredAt}, ${e.notes})`)
        await tx.execute(sql`
          INSERT INTO trip_events (id, trip_id, event_type, occurred_at, notes)
          VALUES ${sql.join(vals, sql`, `)}
          ON CONFLICT (id) DO UPDATE SET notes=EXCLUDED.notes, occurred_at=EXCLUDED.occurred_at
        `)
      }
    })
    logger.info({ paradasEventos: evs.length }, '[painel-sync] paradas->trip_events (linha do tempo)')
  }

  // Tickets/Alertas para o dashboard (Redis). ts só avança quando a aba foi REALMENTE relida (gate 30min).
  try { await redis.set('painel:tickets', JSON.stringify({ ticketsPendentes, alertas, ts: ticketsFresco ? agora.getTime() : prevTs }), 'EX', 3600) } catch { /* noop */ }

  const res: PainelSyncResult = { ativas: activeCods.size, concluidas: all.filter((t) => t.status === 'completed').length, total: all.length, noPrazo, atrasadas, ticketsPendentes, alertas }
  logger.info(res, '[painel-sync] sincronizado com a planilha de produção')
  return res
}
