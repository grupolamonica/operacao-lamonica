/**
 * Sync da aba "Carrega" (Phase 12) — monitoramento ao vivo da GRIFFI (Angellira),
 * a MESMA base do painel GAS (ScriptControleViagens). O web app /exec é protegido
 * por login Google e serve via RPC, então lemos a planilha-fonte por gviz CSV.
 *
 * Faz upsert das viagens ativas em `trips` (status/km/cliente/prazo) + uma posição
 * em `driver_positions` por viagem (para o detector de SEM_GPS / idade de posição).
 * Idempotente: id = uuid5('carrega|'+codViagem). Roda no cron a cada 5min.
 */
import { sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db } from '../../db/client'
import { logger } from '../../lib/logger'

const GVIZ_URL =
  process.env.CARREGA_GVIZ_URL ??
  'https://docs.google.com/spreadsheets/d/1vywBfUJPIA2uEHYaz-WD5xEmNP24n8maMZ1XmN_2VUs/gviz/tq?tqx=out:csv&sheet=Carrega'

// clientes da Torre (ids fixos) — mapeia "Procedimento de Embarque"/"Cliente"
const CLIENTS: Record<string, string> = {
  shopee: 'c022c1f4-ef0b-4b5b-9044-55ac3f61da1d',
  casas: '2f85fe11-46c6-520c-99cd-35a361dad7d2',
  nestle: 'c09d5929-80e2-5a26-a2d3-ad87d92815d9',
  griffi: 'a8c3290b-8ba6-5643-9e38-f2d01b10056a', // Griffi Logística (default)
}

function uuid5(name: string): string {
  // UUIDv5 determinístico (namespace fixo) sem dependência externa
  const NS = '6ba7b8109dad11d180b400c04fd430c8' // hex do namespace DNS
  const h = createHash('sha1').update(Buffer.from(NS, 'hex')).update(name).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else {
      if (c === '"') inQ = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

function kmNum(v: string | undefined): number | null {
  if (!v) return null
  const n = parseFloat(String(v).replace(/km/i, '').trim().replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}
function pct(v: string | undefined): number {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return isNaN(n) ? 0 : Math.max(0, Math.min(100, Math.round(n)))
}
function brDate(v: string | undefined): Date | null {
  if (!v) return null
  const m = String(v).match(/(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) { const d = new Date(v); return isNaN(d.getTime()) ? null : d }
  const d = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0))
  return isNaN(d.getTime()) ? null : d
}
function clientId(proc: string | undefined): string {
  const s = (proc ?? '').toUpperCase()
  if (s.includes('NESTLE') || s.includes('NESTLÉ')) return CLIENTS.nestle
  if (s.includes('CASAS BAHIA')) return CLIENTS.casas
  if (s.includes('SHOPEE')) return CLIENTS.shopee
  return CLIENTS.griffi
}
function mapStatus(s: string | undefined): string {
  const x = (s ?? '').toUpperCase()
  if (x.includes('REALIZ') || x.includes('FINALIZ') || x.includes('CONCLU')) return 'completed'
  if (x.includes('NAO INICIADA') || x.includes('NÃO INICIADA') || x.includes('AGUARD')) return 'planned'
  if (x.includes('CANCEL')) return 'cancelled'
  if (x.includes('INICIADA') || x.includes('ANDAMENTO') || x.includes('TRANSITO') || x.includes('TRÂNSITO')) return 'in_progress'
  return 'in_progress'
}
function norm(s: string | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}
function iso(d: Date | null): string | null {
  return d && !isNaN(d.getTime()) ? d.toISOString() : null
}

export async function syncCarrega(): Promise<{ fetched: number; upserted: number; positions: number }> {
  const res = await fetch(GVIZ_URL, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Carrega gviz HTTP ${res.status}`)
  const csv = await res.text()
  const rows = parseCSV(csv)
  if (rows.length < 2) return { fetched: 0, upserted: 0, positions: 0 }

  const headers = rows[0].map((h) => h.trim())
  const col = (name: string) => headers.indexOf(name)
  const I = {
    cod: col('Cód. Viagem'), proc: col('Procedimento de Embarque'), cliente: col('Cliente'),
    veiculo: col('Veículo'), tipoVeic: col('Tipo Veículo'), motorista: col('Motorista'),
    status: col('Status Viagem'), dataPos: col('Data Posição'), posicao: col('Posição'), estado: col('Estado'),
    origem: col('Origem'), destino: col('Destino'),
    prevChegDest: col('Previsão Chegada Destino'), prevSaidaOrig: col('Previsão Saída Origem'),
    inicio: col('Início Viagem'), chegada: col('Chegada Descarga'), prevChegada: col('Previsão de Chegada'),
    distViagem: col('Dist. Viagem'), distPerc: col('Dist. Percorrida'), pctPerc: col('% Percorrido'),
  }

  const tripVals: any[] = []
  const posVals: any[] = []
  let positions = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const cod = (row[I.cod] ?? '').trim()
    if (!cod) continue
    const status = mapStatus(row[I.status])
    if ((row[I.status] ?? '').toUpperCase().includes('SEM VIAGEM')) continue

    const id = uuid5('carrega|' + cod)
    const ws = brDate(row[I.prevSaidaOrig]) ?? brDate(row[I.inicio]) ?? new Date()
    const we = brDate(row[I.prevChegDest]) ?? brDate(row[I.prevChegada]) ?? new Date(ws.getTime() + 3600000)
    const eta = brDate(row[I.prevChegada]) ?? brDate(row[I.prevChegDest])
    const distTotal = kmNum(row[I.distViagem])
    const distDone = kmNum(row[I.distPerc])
    const motorista = (row[I.motorista] ?? '').trim()
    const dataPos = brDate(row[I.dataPos])

    tripVals.push({
      id, code: cod.slice(0, 20),
      clientId: clientId(row[I.proc] || row[I.cliente]),
      origin: (row[I.origem] ?? '').slice(0, 200) || null,
      destination: (row[I.destino] ?? '').slice(0, 200) || null,
      windowStart: iso(ws)!, windowEnd: iso(we)!, eta: iso(eta),
      status,
      progressPct: pct(row[I.pctPerc]),
      distanceTotal: distTotal != null ? String(distTotal) : null,
      distanceDone: distDone != null ? String(distDone) : null,
      departedAt: iso(brDate(row[I.inicio])),
      arrivedAt: iso(brDate(row[I.chegada])),
      sheetMotorista: motorista || null,
      usedVehicleType: (row[I.tipoVeic] ?? '').slice(0, 30) || null,
    })

    if (motorista && dataPos) {
      posVals.push({
        motorista, motoristaNorm: norm(motorista), dataPosicao: iso(dataPos),
        veiculo: (row[I.veiculo] ?? '').trim() || null,
        posicaoRaw: (row[I.posicao] ?? '').slice(0, 300) || '-',
        uf: (row[I.estado] ?? '').slice(0, 2) || null,
      })
      positions++
    }
  }

  // Upsert trips em lotes via SQL (on conflict id) — só campos da Carrega
  let upserted = 0
  for (const t of tripVals) {
    await db.execute(sql`
      INSERT INTO trips (id, code, client_id, origin, destination, window_start, window_end, eta,
                         status, progress_pct, distance_total, distance_done, departed_at, arrived_at,
                         sheet_motorista, used_vehicle_type, updated_at)
      VALUES (${t.id}, ${t.code}, ${t.clientId}, ${t.origin}, ${t.destination}, ${t.windowStart},
              ${t.windowEnd}, ${t.eta}, ${t.status}, ${t.progressPct},
              ${t.distanceTotal}, ${t.distanceDone}, ${t.departedAt}, ${t.arrivedAt},
              ${t.sheetMotorista}, ${t.usedVehicleType}, now())
      ON CONFLICT (id) DO UPDATE SET
        client_id=EXCLUDED.client_id, origin=EXCLUDED.origin, destination=EXCLUDED.destination,
        window_start=EXCLUDED.window_start, window_end=EXCLUDED.window_end, eta=EXCLUDED.eta,
        status=EXCLUDED.status, progress_pct=EXCLUDED.progress_pct,
        distance_total=EXCLUDED.distance_total, distance_done=EXCLUDED.distance_done,
        departed_at=EXCLUDED.departed_at, arrived_at=EXCLUDED.arrived_at,
        sheet_motorista=EXCLUDED.sheet_motorista, used_vehicle_type=EXCLUDED.used_vehicle_type,
        updated_at=now()
    `)
    upserted++
  }

  for (const p of posVals) {
    await db.execute(sql`
      INSERT INTO driver_positions (motorista, motorista_norm, data_posicao, veiculo, posicao_raw, uf)
      VALUES (${p.motorista}, ${p.motoristaNorm}, ${p.dataPosicao}, ${p.veiculo}, ${p.posicaoRaw}, ${p.uf})
      ON CONFLICT (motorista_norm, data_posicao) DO NOTHING
    `)
  }

  logger.info({ fetched: tripVals.length, upserted, positions }, '[carrega] sync ok')
  return { fetched: tripVals.length, upserted, positions }
}
