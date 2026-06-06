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
 * e DISTANCE_TRAVELED (km percorridos por GPS). É a fonte que o painel GAS usa para o progresso.
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
    out.perc = angularVal(html, 'DISTANCE_TRAVELED')
    if (out.total > 0) out.ok = true
  } catch { /* noop */ }
  return out
}

export interface MonitoringResult { fetched: number; upserted: number; positions: number; semViagem: number }

export async function syncMonitoring(): Promise<MonitoringResult> {
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

      // Progresso = mesma lógica do painel GAS: usa a rota real (DISTANCE_TOTAL/TRAVELED);
      // só cai no proxy distorigem+distfaltante quando a rota não responde.
      const distFalt = num(t.distfaltante)
      const distOrig = num(t.distorigem)
      const d = dists[j]
      let distTotal = d?.ok ? d.total : 0
      let distDone = (d?.ok && d.perc > 0) ? d.perc : 0
      if (distTotal === 0) distTotal = distOrig + distFalt
      if (distDone === 0 && distTotal > 0) distDone = Math.max(0, distTotal - distFalt)
      const pct = distTotal > 0 ? Math.round((distDone / distTotal) * 100) : 0
      const ent = Array.isArray(t.entregas) && t.entregas.length ? t.entregas[0] : {}
      const embRaw = t.emb
      const emb = (embRaw && typeof embRaw === 'object') ? embRaw.nome : embRaw
      const motorista = String(t.motorista ?? v.motorista ?? '').trim()
      const ws = iso(t.dataInicio) ?? new Date().toISOString()
      const we = iso(ent.previsao) ?? iso(t.dataInicio) ?? new Date(Date.now() + 3600000).toISOString()

      await db.execute(sql`
        INSERT INTO trips (id, code, client_id, origin, destination, window_start, window_end, eta,
                           status, progress_pct, distance_total, distance_done, departed_at, arrived_at,
                           sheet_motorista, used_vehicle_type, updated_at)
        VALUES (${uuid5('carrega|' + viacodigo)}, ${viacodigo.slice(0, 20)}, ${clientId(emb)},
                ${String(t.origem ?? '').slice(0, 200) || null}, ${String(t.destino ?? '').slice(0, 200) || null},
                ${ws}, ${we}, ${iso(ent.previsao)},
                ${mapStatus(t.statusnome ?? t.status_viagem)}, ${pct},
                ${distTotal > 0 ? String(distTotal) : null}, ${distTotal > 0 ? String(distDone) : null},
                ${iso(t.dataInicio)}, ${iso(ent.datachegada)},
                ${motorista || null}, ${String(jf?.tipo ?? '').slice(0, 30) || null}, now())
        ON CONFLICT (id) DO UPDATE SET
          client_id=EXCLUDED.client_id, origin=EXCLUDED.origin, destination=EXCLUDED.destination,
          window_start=EXCLUDED.window_start, window_end=EXCLUDED.window_end, eta=EXCLUDED.eta,
          status=EXCLUDED.status, progress_pct=EXCLUDED.progress_pct,
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

  logger.info({ fetched: lista.length, upserted, positions, semViagem }, '[angellira-monitoring] sync ok')
  return { fetched: lista.length, upserted, positions, semViagem }
}
