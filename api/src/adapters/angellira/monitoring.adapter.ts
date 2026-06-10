/**
 * Monitoramento Angellira ao vivo (Phase 12) — substitui o sync da planilha "Carrega".
 * Porte de processar_veiculo() (fetch_positions_json.py): busca-geral lista os
 * veículos; detalhes-veiculo traz a viagem ativa (km restante, status, prazo,
 * cliente, origem/destino). Upsert em `trips` (mesma chave do sync antigo:
 * uuid5('carrega|'+viacodigo) → atualiza no lugar, sem duplicar) + driver_positions.
 *
 * Roda no cron Angellira (a cada 5 min, gated em ANGELLIRA_USER/PASS/EMPRESA). Sem Google Sheet.
 */
import { sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db } from '../../db/client'
import { logger } from '../../lib/logger'
import { getMapsToken, mapsUrl } from './auth'
import { calcularHorasViagemComRegulamentacao, calcularAdiantamentoHoras, PARAMS_PADRAO } from '../../lib/regulamentacao'

const CLIENTS: Record<string, string> = {
  shopee: 'c022c1f4-ef0b-4b5b-9044-55ac3f61da1d',
  casas: '2f85fe11-46c6-520c-99cd-35a361dad7d2',
  nestle: 'c09d5929-80e2-5a26-a2d3-ad87d92815d9',
  griffi: 'a8c3290b-8ba6-5643-9e38-f2d01b10056a',
}
const CONCURRENCY = 8

function uuid5(name: string): string {
  const NS = '6ba7b8109dad11d180b400c04fd430c8'
  const h = createHash('sha1').update(Buffer.from(NS, 'hex')).update(name).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}
function num(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const n = parseFloat(String(v ?? '').replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}
function iso(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim()
  if (!s) return null
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  let d: Date
  if (m) d = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0))
  else d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}
function clientId(emb: string | undefined): string {
  const s = (emb ?? '').toUpperCase()
  if (s.includes('NESTLE') || s.includes('NESTLÉ')) return CLIENTS.nestle
  if (s.includes('CASAS BAHIA')) return CLIENTS.casas
  if (s.includes('SHOPEE')) return CLIENTS.shopee
  return CLIENTS.griffi
}
function mapStatus(s: string | undefined): string {
  const x = (s ?? '').toUpperCase()
  if (x.includes('REALIZ') || x.includes('FINALIZ') || x.includes('CONCLU') || x.includes('ENTREGUE')) return 'completed'
  if (x.includes('CANCEL')) return 'cancelled'
  if (x.includes('AGUARD') || x.includes('NAO INICIAD') || x.includes('NÃO INICIAD')) return 'planned'
  return 'in_progress'
}
function norm(s: string | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

interface VeiculoLista { cod?: number | string; placa?: string; lat?: number | string; lng?: number | string; pos?: string; motorista?: string }

async function detalhes(token: string, cod: number | string): Promise<any | null> {
  try {
    const res = await fetch(mapsUrl(token, 'detalhes-veiculo'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: new URLSearchParams({ vei: String(cod), embs: '', disponibilidade: 'false' }).toString(),
    })
    if (!res.ok) return null
    return ((await res.json()) as any)?.veiculo ?? null
  } catch { return null }
}

/**
 * Lê o valor de uma variável Angular (translate="<chave>") no HTML da rota.
 * O label tem o atributo translate; o valor (número + "km") fica no elemento irmão seguinte.
 * Porte do buscar_angular() (BeautifulSoup) → primeiro `>NÚMERO<` após o marcador.
 */
function angularVal(html: string, key: string): number {
  const i = html.indexOf(`translate="${key}"`)
  if (i < 0) return 0
  const after = html.slice(i, i + 800)
  const m = after.match(/>\s*(\d[\d.]*(?:,\d+)?)\s*(?:km)?\s*</i)
  return m ? num(m[1]) : 0
}

/**
 * Distância real da rota (porte de obter_distancias()): POST /veiculo-rota devolve o link
 * do mapa da viagem; GET <link>/sub/2 traz a página com DISTANCE_TOTAL (km totais da rota)
 * e DISTANCE_DONE (km percorridos por GPS). É a fonte que o painel GAS usa para o progresso.
 * (O Python original lia DISTANCE_TRAVELED, chave que não existe mais no HTML → sempre caía
 *  no fallback; aqui usamos DISTANCE_DONE, a chave real do layout atual.)
 */
async function distancias(token: string, vei: number | string, via: number | string): Promise<{ total: number; perc: number; ok: boolean }> {
  const out = { total: 0, perc: 0, ok: false }
  try {
    const r = await fetch(mapsUrl(token, 'veiculo-rota'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: new URLSearchParams({ veiculo: String(vei), viagem: String(via) }).toString(),
    })
    if (!r.ok) return out
    let link = (await r.text()).trim().replace(/^"|"$/g, '')
    if (!link.includes('http')) return out
    if (link.endsWith('/')) link = link.slice(0, -1)
    const h = await fetch(link + '/sub/2')
    if (!h.ok) return out
    const html = await h.text()
    out.total = angularVal(html, 'DISTANCE_TOTAL')
    out.perc = angularVal(html, 'DISTANCE_DONE')
    if (out.total > 0) out.ok = true
  } catch { /* noop */ }
  return out
}

// Pares from/to do translate() p/ strip de acentos no Postgres (mesma normalização do normalizeMotorista).
const ACC = "'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç','AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'"

/**
 * Reconcilia o RASTREAMENTO ao vivo do Angellira (viagens code-numérico, source
 * nulo, invisíveis nas telas) com as CARGAS da aba SHOPEE (source='cargas',
 * keyed por LH, exibidas em Viagens) — o que o usuário chamou de "sincronizar as
 * cargas rastreadas no Angellira com as cargas da aba SHOPEE".
 *
 * O Angellira NÃO expõe o LH; a chave de ligação é o MOTORISTA (um motorista
 * dirige 1 viagem por vez — validado: 21/26 ativas casam por motorista+cavalo).
 * Copia progresso/distância/ETA/SLA/atraso ao vivo p/ a carga SHOPEE, que era
 * estática (0% progresso). UPDATE set-based por nome normalizado (translate/upper).
 */
async function reconcileTrackingToCargas(): Promise<number> {
  const res = await db.execute(sql`
    UPDATE trips c SET
      progress_pct       = a.progress_pct,
      distance_total     = COALESCE(a.distance_total, c.distance_total),
      distance_done      = COALESCE(a.distance_done, c.distance_done),
      eta                = COALESCE(a.eta, c.eta),
      sla_status         = a.sla_status,
      adiantamento_horas = a.adiantamento_horas,
      departed_at        = COALESCE(a.departed_at, c.departed_at),
      updated_at         = now()
    FROM (
      SELECT DISTINCT ON (mot) mot, progress_pct, distance_total, distance_done, eta, sla_status, adiantamento_horas, departed_at
      FROM (
        SELECT upper(translate(trim(sheet_motorista), ${sql.raw(ACC)})) AS mot,
               progress_pct, distance_total, distance_done, eta, sla_status, adiantamento_horas, departed_at, updated_at
        FROM trips
        WHERE code ~ '^[0-9]+$' AND status = 'in_progress'
          AND sheet_motorista IS NOT NULL AND trim(sheet_motorista) <> ''
      ) t
      ORDER BY mot, updated_at DESC
    ) a
    WHERE c.source = 'cargas'
      AND c.sheet_motorista IS NOT NULL
      AND upper(translate(trim(c.sheet_motorista), ${sql.raw(ACC)})) = a.mot
      AND (c.cargas_status IS NULL OR c.cargas_status NOT IN ('DESCARREGADO', 'CANCELADO', 'NO SHOW'))
  `)
  return (res as any)?.rowCount ?? (res as any)?.count ?? 0
}

export interface MonitoringResult { fetched: number; upserted: number; positions: number; semViagem: number; cargasReconciled?: number }

export async function syncMonitoring(): Promise<MonitoringResult> {
  const syncStart = new Date()
  const token = await getMapsToken()
  const res = await fetch(mapsUrl(token, 'busca-geral'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
    body: new URLSearchParams({ diasSemViagem: '60' }).toString(),
  })
  if (!res.ok) throw new Error(`Angellira busca-geral ${res.status}`)
  const lista = (((await res.json()) as any)?.values ?? []) as VeiculoLista[]

  let upserted = 0, positions = 0, semViagem = 0
  for (let i = 0; i < lista.length; i += CONCURRENCY) {
    const slice = lista.slice(i, i + CONCURRENCY)
    const dets = await Promise.all(slice.map((v) => (v.cod != null ? detalhes(token, v.cod) : Promise.resolve(null))))
    // Distância real da rota (DISTANCE_TOTAL/TRAVELED) em paralelo — depende do viacodigo do detalhe.
    const dists = await Promise.all(slice.map((v, j) => {
      const via = dets[j]?.viagens?.[0]?.viacodigo
      return (v.cod != null && via != null) ? distancias(token, v.cod, via) : Promise.resolve(null)
    }))

    for (let j = 0; j < slice.length; j++) {
      const v = slice[j], jf = dets[j]
      const viagens = jf?.viagens
      if (!Array.isArray(viagens) || viagens.length === 0) { semViagem++; continue }
      const t = viagens[0]
      const viacodigo = String(t.viacodigo ?? t.transporte ?? v.cod ?? '').trim()
      if (!viacodigo) { semViagem++; continue }

      // Progresso = exatamente como o painel GAS:
      //  - distTotal = DISTANCE_TOTAL da rota (km fixos do cadastro); fallback distorigem+distfaltante.
      //  - kmFalta   = distfaltante cru da API (= "KM que Falta" do painel; = DISTANCE_UNDONE).
      //  - distDone  = distTotal - distfaltante  → progresso = (distTotal-distfaltante)/distTotal.
      const distFalt = num(t.distfaltante)
      const distOrig = num(t.distorigem)
      const d = dists[j]
      let distTotal = d?.ok ? d.total : 0
      if (distTotal === 0) distTotal = distOrig + distFalt
      const kmFalta = distFalt > 0 ? distFalt : Math.max(0, distTotal - 0)
      const distDone = Math.max(0, distTotal - distFalt)
      const pct = distTotal > 0 ? Math.min(100, Math.round((distDone / distTotal) * 100)) : 0
      const ent = Array.isArray(t.entregas) && t.entregas.length ? t.entregas[0] : {}
      const embRaw = t.emb
      const emb = (embRaw && typeof embRaw === 'object') ? embRaw.nome : embRaw
      const motorista = String(t.motorista ?? v.motorista ?? '').trim()
      const ws = iso(t.dataInicio) ?? new Date().toISOString()

      // --- SLA (lei do motorista) — paridade com recalcularStatusLinhaLocal() do painel ---
      let mapped = mapStatus(t.statusnome ?? t.status_viagem)
      // Chegou (≤ kmParaConsiderarChegou) → CONCLUÍDA, igual ao painel: sai de "em andamento".
      if (mapped !== 'cancelled' && distTotal > 0 && kmFalta <= PARAMS_PADRAO.kmParaConsiderarChegou) mapped = 'completed'
      const agora = new Date()
      // Presa: iniciada há > 7 dias e ainda "ativa" = abandonada na Angellira (busca de 60d ainda a
      // devolve, mas o painel só mantém ~7 dias no feed Carrega). Trata como concluída p/ não inflar ativas/atrasadas.
      if (mapped !== 'cancelled' && ws && (agora.getTime() - new Date(ws).getTime()) > 7 * 86400000) mapped = 'completed'
      const moros = num(t.morosidade ?? 0)
      // Prazo Final (deadline) = t.dataPrevFim — o prazo final CONTRATADO da viagem, idêntico à coluna
      // "Prazo Final" do painel (validado no JSON live: EDSON 09/06 09:01, RENATO 10/06 07:00 batem exato).
      // NÃO usar ent.previsaochegada (= previsão de entrega, mais cedo) → causava atraso em dobro.
      // Fallbacks: previsaochegada → previsão crua → dataInicio + tempo de rota total.
      const prazoIso = iso(t.dataPrevFim) ?? iso((ent as any).previsaochegada) ?? iso(ent.previsao)
        ?? (ws ? new Date(new Date(ws).getTime() + calcularHorasViagemComRegulamentacao(distTotal, PARAMS_PADRAO) * 3600000).toISOString() : null)
      const prazoDate = prazoIso ? new Date(prazoIso) : null
      const we = prazoIso ?? iso(t.dataInicio) ?? new Date(Date.now() + 3600000).toISOString()

      // Previsão de Chegada computada (agora + tempo de rota restante com pausas/jornada)
      let etaIso: string
      if (kmFalta <= PARAMS_PADRAO.kmParaConsiderarChegou) {
        etaIso = agora.toISOString()
      } else {
        const tRest = calcularHorasViagemComRegulamentacao(kmFalta, PARAMS_PADRAO)
        etaIso = Number.isFinite(tRest)
          ? new Date(agora.getTime() + tRest * 3600000).toISOString()
          : (iso(ent.previsao) ?? we)
      }

      // Atraso (+ = atrasado, igual ao painel) e classificação NO PRAZO / ATRASADO.
      const adiant = calcularAdiantamentoHoras(kmFalta, prazoDate, agora, moros, PARAMS_PADRAO) // + = adiantado
      const atrasoHoras = adiant == null ? null : -adiant                                       // inverte → + = atrasado
      let slaStatus: string | null = null
      if (mapped === 'completed' || mapped === 'cancelled' || atrasoHoras == null) slaStatus = null
      else if (kmFalta <= PARAMS_PADRAO.kmParaConsiderarChegou) slaStatus = null  // chegou (painel: CONCLUÍDO) → fora de No Prazo/Atrasadas
      else if (atrasoHoras > 0) slaStatus = 'atrasado'
      else slaStatus = 'no_prazo'

      await db.execute(sql`
        INSERT INTO trips (id, code, client_id, origin, destination, window_start, window_end, eta,
                           status, sla_status, adiantamento_horas, morosidade_horas, conducao_regime,
                           progress_pct, distance_total, distance_done, departed_at, arrived_at,
                           sheet_motorista, used_vehicle_type, updated_at)
        VALUES (${uuid5('carrega|' + viacodigo)}, ${viacodigo.slice(0, 20)}, ${clientId(emb)},
                ${String(t.origem ?? '').slice(0, 200) || null}, ${String(t.destino ?? '').slice(0, 200) || null},
                ${ws}, ${we}, ${etaIso},
                ${mapped}, ${slaStatus}, ${atrasoHoras != null ? String(atrasoHoras) : null},
                ${moros ? String(moros) : null}, 'intensivo',
                ${pct},
                ${distTotal > 0 ? String(distTotal) : null}, ${distTotal > 0 ? String(distDone) : null},
                ${iso(t.dataInicio)}, ${iso(ent.datachegada) ?? (mapped === 'completed' ? agora.toISOString() : null)},
                ${motorista || null}, ${String(jf?.tipo ?? '').slice(0, 30) || null}, now())
        ON CONFLICT (id) DO UPDATE SET
          client_id=EXCLUDED.client_id, origin=EXCLUDED.origin, destination=EXCLUDED.destination,
          window_start=EXCLUDED.window_start, window_end=EXCLUDED.window_end, eta=EXCLUDED.eta,
          status=EXCLUDED.status, sla_status=EXCLUDED.sla_status, adiantamento_horas=EXCLUDED.adiantamento_horas,
          morosidade_horas=COALESCE(EXCLUDED.morosidade_horas, trips.morosidade_horas),
          conducao_regime=COALESCE(trips.conducao_regime, EXCLUDED.conducao_regime),
          progress_pct=EXCLUDED.progress_pct,
          distance_total=EXCLUDED.distance_total, distance_done=EXCLUDED.distance_done,
          departed_at=EXCLUDED.departed_at, arrived_at=EXCLUDED.arrived_at,
          sheet_motorista=EXCLUDED.sheet_motorista, used_vehicle_type=EXCLUDED.used_vehicle_type, updated_at=now()
      `)
      upserted++

      const dataPos = iso(t.dataUltimaPosicao) ?? new Date().toISOString()
      if (motorista) {
        await db.execute(sql`
          INSERT INTO driver_positions (motorista, motorista_norm, data_posicao, veiculo, posicao_raw, lat, lng, geocoded)
          VALUES (${motorista}, ${norm(motorista)}, ${dataPos}, ${String(v.placa ?? '').trim() || null},
                  ${String(v.pos ?? '-').slice(0, 300) || '-'},
                  ${v.lat != null ? String(v.lat) : null}, ${v.lng != null ? String(v.lng) : null}, true)
          ON CONFLICT (motorista_norm, data_posicao) DO NOTHING
        `)
        positions++
      }
    }
  }

  // Fecha viagens GRIFFI que saíram do feed da Angellira (não vistas neste sync e ausentes há >10min,
  // ~2 ciclos): o painel só mostra o feed atual (Carrega), então elas já concluíram/saíram da rota.
  // Sem isso, viagens antigas ficam presas em in_progress com prazo vencido e inflam as "Atrasadas".
  // Se a viagem reaparecer no feed, o upsert acima a reabre (status=mapped) — auto-corrige.
  const closed = await db.execute(sql`
    UPDATE trips SET status='completed', sla_status=NULL,
      arrived_at=COALESCE(arrived_at, updated_at), updated_at=now()
    WHERE status='in_progress' AND code ~ '^[0-9]+$'
      AND updated_at < ${syncStart.toISOString()}
      AND updated_at < now() - interval '10 minutes'
  `)
  const closedCount = (closed as any)?.rowCount ?? (closed as any)?.count ?? 0

  // Sincroniza o rastreamento ao vivo → cargas da aba SHOPEE (por motorista).
  const cargasReconciled = await reconcileTrackingToCargas()

  logger.info({ fetched: lista.length, upserted, positions, semViagem, closedStale: closedCount, cargasReconciled }, '[angellira-monitoring] sync ok')
  return { fetched: lista.length, upserted, positions, semViagem, cargasReconciled }
}
