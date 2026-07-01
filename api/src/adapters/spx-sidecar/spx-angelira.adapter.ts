/**
 * Phase 15 — poller SPX x Angellira (checagem automática de liberação de risco).
 *
 * A cada ciclo (agendado no angellira-cron):
 *   1. GET  {SPX_SIDECAR_URL}/spx/trips/snapshot   → viagens com veículo (tab Aceito)
 *   2. POST {ANGELLIRA_SIDECAR_URL}/angelira/consultas/placas → status por placa (1 varredura)
 *   3. reconcilia cavalo+carreta de cada viagem, faz upsert em spx_trip_check
 *   4. dispara ocorrência (alerts + WS + web push) para viagem cujo veículo está
 *      VENCIDO ou SEM consulta na Angellira — só em furo NOVO/alterado (sem spam).
 *
 * Sem libs HTTP novas (fetch nativo do Bun). Config 100% por env. No-op se as
 * URLs dos sidecars não estiverem definidas.
 */
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { spxTripCheck } from '../../db/schema/spx-trip-check'
import { logger } from '../../lib/logger'
import { createAlert } from '../../modules/alerts/alerts.service'
import { dispatchAlertPush } from '../../modules/push/push.dispatcher'
import { redis } from '../../redis/client'

const ALERT_TYPE = 'consulta_angelira_vencida'

interface SpxTrip {
  trip_number: string
  trip_name?: string | null
  origem?: string | null
  destino?: string | null
  driver_name?: string
  vehicle_type?: string
  cavalo?: string
  carreta?: string
  trip_status_name?: string | null
}

interface PlacaInfo { achada: boolean | null; status: string | null; limitDate: string | null; vencida: boolean | null }

export interface SpxAngeliraResult { fetched: number; ok: number; furos: number; alerts: number; ts: string }

function envUrl(name: string): string | null {
  const v = process.env[name]
  return v && v.trim() ? v.replace(/\/+$/, '') : null
}

const normPlate = (p: string): string => (p || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export async function syncSpxAngelira(): Promise<SpxAngeliraResult | { skipped: true; reason: string }> {
  const spxUrl = envUrl('SPX_SIDECAR_URL')
  const angUrl = envUrl('ANGELLIRA_SIDECAR_URL')
  if (!spxUrl || !angUrl) {
    logger.warn('[spx-angelira] desativado — defina SPX_SIDECAR_URL e ANGELLIRA_SIDECAR_URL')
    return { skipped: true, reason: 'SPX_SIDECAR_URL/ANGELLIRA_SIDECAR_URL ausentes' }
  }

  // 1) snapshot das viagens SPX com veículo (tab Aceito ignora a janela de data)
  const station = process.env.SPX_LINEHAUL_STATION_ID || ''
  const snapUrl = `${spxUrl}/spx/trips/snapshot?query_type=2${station ? `&station_id=${station}` : ''}`
  const sres = await fetch(snapUrl, { signal: AbortSignal.timeout(120_000) })
  if (!sres.ok) throw new Error(`SPX sidecar /trips/snapshot ${sres.status}: ${(await sres.text()).slice(0, 200)}`)
  const snap = (await sres.json()) as { trips?: SpxTrip[] }
  const trips = (snap.trips ?? []).filter((t) => t.trip_number && (t.cavalo || t.carreta))
  const now = new Date()
  if (!trips.length) {
    logger.info('[spx-angelira] 0 viagens com veículo')
    return { fetched: 0, ok: 0, furos: 0, alerts: 0, ts: now.toISOString() }
  }

  // 2) consulta Angellira em lote (todas as placas numa varredura só)
  const placasSet = new Set<string>()
  for (const t of trips) { if (t.cavalo) placasSet.add(t.cavalo); if (t.carreta) placasSet.add(t.carreta) }
  const ares = await fetch(`${angUrl}/angelira/consultas/placas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placas: [...placasSet], dias_atras: 365 }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!ares.ok) throw new Error(`Angellira sidecar /consultas/placas ${ares.status}: ${(await ares.text()).slice(0, 200)}`)
  const aj = (await ares.json()) as { placas?: Record<string, PlacaInfo> }
  const placaMap = aj.placas ?? {}
  const info = (p: string): PlacaInfo | undefined => placaMap[normPlate(p)]

  // 3) reconcilia + upsert + alerta
  let ok = 0, furos = 0, alertCount = 0
  for (const t of trips) {
    const placas: { placa: string; tipo: string; achada: boolean | null; status: string | null; vencida: boolean | null }[] = []
    const problems: string[] = []
    let temSemConsulta = false
    for (const [tipo, placa] of [['cavalo', t.cavalo], ['carreta', t.carreta]] as const) {
      if (!placa) continue
      const i = info(placa)
      placas.push({ placa, tipo, achada: i?.achada ?? null, status: i?.status ?? null, vencida: i?.vencida ?? null })
      if (i && i.achada === false) { problems.push(`${tipo} ${placa} sem consulta`); temSemConsulta = true }
      else if (i && i.vencida) { problems.push(`${tipo} ${placa} vencida${i.limitDate ? ` (${String(i.limitDate).slice(0, 10)})` : ''}`) }
      // i indefinido / achada null => inconclusivo (rede/auth): não bloqueia
    }
    const isFuro = problems.length > 0
    const detalhe = isFuro ? problems.join('; ') : 'OK'
    const vencida = problems.some((p) => p.includes('vencida'))
    if (isFuro) furos++; else ok++

    const prev = (await db
      .select({ alertFlag: spxTripCheck.alertFlag, detalhe: spxTripCheck.detalhe })
      .from(spxTripCheck).where(eq(spxTripCheck.tripNumber, t.trip_number)).limit(1))[0]

    const rowValues = {
      tripName: t.trip_name ?? null,
      origem: t.origem ?? null,
      destino: t.destino ?? null,
      motorista: t.driver_name || null,
      cavalo: t.cavalo || null,
      carreta: t.carreta || null,
      tripStatus: t.trip_status_name ?? null,
      placas,
      angeliraOk: !isFuro,
      vencida,
      detalhe,
      alertFlag: isFuro,
      checkedAt: now,
    }
    await db.insert(spxTripCheck)
      .values({ tripNumber: t.trip_number, ...rowValues })
      .onConflictDoUpdate({ target: spxTripCheck.tripNumber, set: rowValues })

    // alerta só em furo NOVO ou cujo detalhe mudou (evita reabrir a cada 5 min)
    if (isFuro && (!prev || !prev.alertFlag || prev.detalhe !== detalhe)) {
      const severity: 'critico' | 'medio' = temSemConsulta ? 'critico' : 'medio'
      const title = `Veículo sem liberação Angellira — viagem ${t.trip_number}`
      const description = `${detalhe}. ${t.origem ?? '?'} → ${t.destino ?? '?'} · motorista ${t.driver_name || '—'} · status SPX ${t.trip_status_name ?? '—'}`
      try {
        const row = await createAlert({ type: ALERT_TYPE, severity, title, description })
        alertCount++
        // createAlert não entrega sozinho — empurra realtime (WS via redis) + web push
        await redis.publish('alerts:new', JSON.stringify({
          type: 'alert:new', alertId: row.id, severity: row.severity, alertType: row.type, tripId: row.tripId, title: row.title,
        })).catch(() => {})
        void dispatchAlertPush({ id: row.id, title: row.title, description: row.description ?? '', severity: row.severity as 'critico' | 'medio' | 'baixo' }).catch(() => {})
      } catch (e) {
        logger.error({ err: (e as Error)?.message, trip: t.trip_number }, '[spx-angelira] falha ao criar alerta')
      }
    }
  }

  const result: SpxAngeliraResult = { fetched: trips.length, ok, furos, alerts: alertCount, ts: now.toISOString() }
  logger.info(result, '[spx-angelira] sync ok')
  return result
}
