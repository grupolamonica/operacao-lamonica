import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { trips } from '../../db/schema/trips'
import { drivers } from '../../db/schema/drivers'
import { clients } from '../../db/schema/clients'
import { routes } from '../../db/schema/routes'
import { tripEvents } from '../../db/schema/trip-events'
import { fetchRouteScores } from '../ranking/ranking.reads'
import { formatarAtraso, calcularHorasViagemComRegulamentacao, calcularAdiantamentoHoras, PARAMS_PADRAO, PARAMS_REGULAR } from '../../lib/regulamentacao'

/**
 * Meta KM/Dia — porte de recalcularStatusLinhaLocal() do painel:
 * dias-calendário(hoje → ETA); ≤0 → "kmFalta KM/hoje"; senão "kmFalta/ceil(dias) KM/dia";
 * teto = velocidadeMedia × jornadaDiaria → "(Máx.)".
 */
function calcMetaKmDia(kmFalta: number, eta: Date | null, slaStatus: string | null, regime: string | null): string {
  if (slaStatus == null) return '—'
  const params = regime === 'regular' ? PARAMS_REGULAR : PARAMS_PADRAO
  if (!eta || !(kmFalta > 0) || params.velocidadeMedia <= 0 || params.jornadaDiariaConducao <= 0) return 'N/A'
  const d0 = new Date(); d0.setHours(0, 0, 0, 0)
  const d1 = new Date(eta); d1.setHours(0, 0, 0, 0)
  let dias = (d1.getTime() - d0.getTime()) / 86400000
  const cap = params.velocidadeMedia * params.jornadaDiariaConducao // 60*12 = 720
  if (dias <= 0.001) return `${Math.round(kmFalta)} KM/hoje`
  dias = Math.ceil(dias)
  const meta = kmFalta / dias
  if (meta > cap) return `${Math.round(cap)} KM/dia (Máx.)`
  return `${Math.round(meta)} KM/dia`
}

export type TripFilters = {
  status?:     'planned'|'in_progress'|'completed'|'delayed'|'cancelled'
  slaStatus?:  'no_prazo'|'em_risco'|'atrasado'|'sem_sinal'
  clientName?: string
  driverName?: string
  priority?:   'alta'|'media'|'baixa'
  routeCode?:  string
  search?:     string
}

export async function listTrips(filters: TripFilters, page = 0, limit = 100) {
  const conditions = []
  // Universo operacional = painel (ao vivo, sync 10min) + cargas (fonte de viagens, Onda A/D-14).
  // Exclui o histórico (source nulo = import ranking/DBLH) — não é viagem operacional.
  conditions.push(sql`${trips.source} IN ('painel', 'cargas')`)
  if (filters.status)    conditions.push(eq(trips.status, filters.status))
  if (filters.slaStatus) conditions.push(eq(trips.slaStatus, filters.slaStatus))
  if (filters.priority)  conditions.push(eq(trips.priority, filters.priority))

  if (filters.clientName) {
    const [c] = await db.select({ id: clients.id }).from(clients).where(eq(clients.name, filters.clientName)).limit(1)
    conditions.push(c ? eq(trips.clientId, c.id) : sql`false`)
  }
  if (filters.routeCode) {
    const [r] = await db.select({ id: routes.id }).from(routes).where(eq(routes.code, filters.routeCode)).limit(1)
    conditions.push(r ? eq(trips.routeId, r.id) : sql`false`)
  }
  if (filters.driverName) {
    const matchingDrivers = await db.select({ id: drivers.id }).from(drivers).where(ilike(drivers.name, `%${filters.driverName}%`))
    if (matchingDrivers.length === 0) {
      conditions.push(sql`false`)
    } else {
      conditions.push(sql`${trips.driverId} IN (${sql.join(matchingDrivers.map(d => sql`${d.id}`), sql`, `)})`)
    }
  }
  if (filters.search) {
    conditions.push(or(
      ilike(trips.code, `%${filters.search}%`),
      ilike(trips.origin, `%${filters.search}%`),
      ilike(trips.destination, `%${filters.search}%`),
    )!)
  }

  const where = conditions.length ? and(...conditions) : undefined

  const rows = await db.query.trips.findMany({
    where,
    with: {
      driver:  { columns: { id: true, name: true, photoUrl: true, code: true } },
      vehicle: { columns: { plate: true, type: true } },
      client:  { columns: { name: true } },
      route:   { columns: { code: true, name: true } },
    },
    orderBy: (t, { desc }) => [desc(t.windowStart)],
    limit,
    offset: page * limit,
  })

  return rows.map(toTripDto)
}

export async function getTripById(id: string) {
  const trip = await db.query.trips.findFirst({
    where: eq(trips.id, id),
    with: {
      driver:  { columns: { id: true, name: true, photoUrl: true, code: true } },
      vehicle: { columns: { plate: true, type: true } },
      client:  { columns: { name: true } },
      route:   { columns: { code: true, name: true } },
    },
  })
  return trip ? toTripDto(trip) : null
}

export type RouteOption = { value: string; label: string; source: 'torre' | 'ranking' | 'cargas' }

// Dedupe por label normalizado: sem acento + espaços colapsados + UPPER.
const normRouteLabel = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * GET /api/trips/route-options (Fix B2) — UNION de rotas distintas das 3 fontes:
 *   (a) Torre: tabela routes (code/name) — casa com trips.routeId (painel);
 *   (b) Ranking: pares origin_code→destination_code de route_scores (o ranking
 *       não tem cadastro de rota próprio — route_scores é o único dado de rota lá);
 *   (c) Cargas: origem→destino dos open loads persistidos (cargas_open_loads) +
 *       trips source='cargas' (sem route_id — o front casa por origin/destination).
 */
export async function getTripRouteOptions(): Promise<RouteOption[]> {
  const torre = await db.select({ code: routes.code, name: routes.name }).from(routes).orderBy(routes.code)

  const cargasPairs = (await db.execute(sql`
    SELECT DISTINCT origem, destino FROM cargas_open_loads
    WHERE nullif(trim(origem), '') IS NOT NULL AND nullif(trim(destino), '') IS NOT NULL
    UNION
    SELECT DISTINCT origin AS origem, destination AS destino FROM trips
    WHERE source = 'cargas' AND nullif(trim(origin), '') IS NOT NULL AND nullif(trim(destination), '') IS NOT NULL
    ORDER BY origem, destino
  `)) as unknown as Array<{ origem: string; destino: string }>

  let rankingScores: Awaited<ReturnType<typeof fetchRouteScores>> = []
  try {
    rankingScores = await fetchRouteScores()
  } catch {
    // Supabase do Ranking indisponível/sem credencial — segue só com Torre + Cargas
  }

  const seen = new Set<string>()
  const out: RouteOption[] = []
  const push = (value: string, label: string, source: RouteOption['source']) => {
    const key = normRouteLabel(label)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push({ value, label, source })
  }
  for (const r of torre) push(r.code, r.name?.trim() ? r.name : r.code, 'torre')
  for (const s of rankingScores) push(`${s.origin_code} → ${s.destination_code}`, `${s.origin_code} → ${s.destination_code}`, 'ranking')
  for (const p of cargasPairs) push(`${p.origem} → ${p.destino}`, `${p.origem} → ${p.destino}`, 'cargas')
  return out
}

export async function getTripStats() {
  const allActive = await db.select().from(trips).where(and(
    eq(trips.source, 'painel'),
    or(
      eq(trips.status, 'in_progress'),
      eq(trips.status, 'planned'),
      eq(trips.status, 'delayed'),
    )!,
  ))
  const total    = allActive.length
  const noPrazo  = allActive.filter(t => t.slaStatus === 'no_prazo').length
  const emRisco  = allActive.filter(t => t.slaStatus === 'em_risco').length
  const atrasadas = allActive.filter(t => t.slaStatus === 'atrasado' || t.status === 'delayed').length
  const avgProgress = total > 0 ? Math.round(allActive.reduce((s, t) => s + (t.progressPct ?? 0), 0) / total) : 0

  return {
    total:          { count: total },
    noPrazo:        { count: noPrazo,   pct: total ? Math.round((noPrazo   / total) * 100) : 0 },
    emRisco:        { count: emRisco,   pct: total ? Math.round((emRisco   / total) * 100) : 0 },
    atrasadas:      { count: atrasadas, pct: total ? Math.round((atrasadas / total) * 100) : 0 },
    progressoMedio: { pct: avgProgress },
  }
}

function toTripDto(row: any) {
  const distanceTotal = row.distanceTotal ? Number(row.distanceTotal) : 0
  const distanceDone  = row.distanceDone  ? Number(row.distanceDone)  : 0
  const kmFalta = Math.max(0, distanceTotal - distanceDone)

  // SLA recomputado AO VIVO (now) para viagens GRIFFI ativas — igual ao painel (recalc 5s no cliente).
  // Para concluídas/imports, usa o valor persistido. Mantém eta/atraso/status sempre frescos.
  const ativa = row.status !== 'completed' && row.status !== 'cancelled' && /^[0-9]+$/.test(row.code ?? '')
  let eta: any = row.eta
  let slaStatus: string | null = row.slaStatus
  let adiant: number | null = row.adiantamentoHoras != null ? Number(row.adiantamentoHoras) : null
  if (ativa && row.windowEnd) {
    const agora = new Date()
    const params = row.conducaoRegime === 'regular' ? PARAMS_REGULAR : PARAMS_PADRAO
    if (kmFalta <= params.kmParaConsiderarChegou) {
      eta = agora; slaStatus = null; adiant = null
    } else {
      const tRest = calcularHorasViagemComRegulamentacao(kmFalta, params)
      eta = Number.isFinite(tRest) ? new Date(agora.getTime() + tRest * 3600000) : row.eta
      const a = calcularAdiantamentoHoras(kmFalta, new Date(row.windowEnd), agora, Number(row.morosidadeHoras ?? 0), params)
      adiant = a == null ? null : -a
      if (row.windowStart && new Date(row.windowStart) > agora) slaStatus = 'no_prazo'  // aguardando partida
      else slaStatus = adiant == null ? null : adiant > 0 ? 'atrasado' : 'no_prazo'
    }
  }

  return {
    id:            row.id,
    code:          row.code,
    driverId:      row.driverId,
    vehicleId:     row.vehicleId,
    driverName:    row.driver?.name || row.sheetMotorista || '',
    driverPhoto:   row.driver?.photoUrl ?? null,
    plate:         row.vehicle?.plate ?? '',
    clientName:    row.client?.name ?? '',
    operationName: row.route?.name ?? '',
    routeCode:     row.route?.code ?? '',
    priority:      row.priority,
    origin:        row.origin,
    destination:   row.destination,
    originLat:     row.originLat ? Number(row.originLat) : 0,
    originLng:     row.originLng ? Number(row.originLng) : 0,
    destLat:       row.destLat ? Number(row.destLat) : 0,
    destLng:       row.destLng ? Number(row.destLng) : 0,
    windowStart:   row.windowStart,
    windowEnd:     row.windowEnd,
    eta,
    departedAt:    row.departedAt,
    arrivedAt:     row.arrivedAt,
    status:        row.status,
    slaStatus,
    source:        row.source ?? null,
    progressPct:   row.progressPct,
    distanceTotal,
    distanceDone,
    // Phase 13 — paridade painel: KM que Falta, Atraso (±HH:MM), Condução, Meta KM/Dia (recomputados ao vivo)
    kmFalta,
    adiantamentoHoras: adiant,
    atrasoLabel:       formatarAtraso(adiant),
    conducaoRegime:    (row.conducaoRegime ?? 'intensivo') as 'intensivo' | 'regular',
    metaKmDia:         calcMetaKmDia(kmFalta, eta ? new Date(eta) : null, slaStatus, row.conducaoRegime),
    valor:         row.valor != null ? Number(row.valor) : null,
    bonus:         row.bonus != null ? Number(row.bonus) : null,
    // Phase 14 — status operacional do Cargas (sheet_status) cruzado por LH
    cargasStatus:  (row as { cargasStatus?: string | null }).cargasStatus ?? null,
    // Sprint 3 — risk snapshot (nullable until first recalc)
    riskScore:     row.riskScore ?? null,
    riskLevel:     row.riskLevel ?? null,
    riskFactors:   row.riskFactors ?? null,
  }
}

/**
 * Registra uma nota / intervenção do operador como trip_event (Phase 12, D-12-29).
 * kind: manual_note | reagendamento | autorizacao_atraso. Torre é read-only sobre
 * a fonte Lamonica — a intervenção fica como evento local na timeline.
 */
export async function addTripNote(input: {
  tripId: string
  userId: string
  text: string
  kind?: 'manual_note' | 'reagendamento' | 'autorizacao_atraso'
}) {
  const [exists] = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, input.tripId)).limit(1)
  if (!exists) return null
  const [row] = await db.insert(tripEvents).values({
    tripId:    input.tripId,
    eventType: input.kind ?? 'manual_note',
    notes:     input.text,
    createdBy: input.userId,
    occurredAt: new Date(),
    metadata:  { source: 'operator' },
  }).returning()
  return row
}
