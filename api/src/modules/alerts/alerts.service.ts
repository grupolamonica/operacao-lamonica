import { and, eq, ilike, or, sql, inArray, isNull } from 'drizzle-orm'
import { db } from '../../db/client'
import { alerts } from '../../db/schema/alerts'
import { treatments } from '../../db/schema/treatments'
import { trips } from '../../db/schema/trips'
import { clients } from '../../db/schema/clients'
import { routes } from '../../db/schema/routes'
import { prazoRangeSql } from '../../lib/prazoRange'
import { brWallNow } from '../../lib/time'

// Pares from/to do translate() p/ strip de acentos no Postgres (mesma normalização do normalizeMotorista).
const ACC = "'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç','AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'"

export type AlertFilters = {
  id?:         string   // busca uma ocorrência específica (deep-link) — ignora o teto de 500
  severity?:   'critico'|'medio'|'baixo'
  status?:     'aberto'|'em_analise'|'em_tratativa'|'resolvido'|'encerrado'
  type?:       string
  clientName?: string
  routeCode?:  string
  assignedTo?: string
  inicio?:     string | null
  fim?:        string | null
  search?:     string
}

export async function listAlerts(f: AlertFilters) {
  const conditions = []
  if (f.id)         conditions.push(eq(alerts.id, f.id))
  if (f.severity)   conditions.push(eq(alerts.severity, f.severity))
  if (f.status)     conditions.push(eq(alerts.status, f.status))
  if (f.type)       conditions.push(eq(alerts.type, f.type))
  // Responsável: uuid do operador, ou '__unassigned' (sem responsável) → IS NULL.
  if (f.assignedTo === '__unassigned') conditions.push(isNull(alerts.assignedTo))
  else if (f.assignedTo) conditions.push(eq(alerts.assignedTo, f.assignedTo))
  // Período por DATA DE ABERTURA do ticket (occurred_at) — filtra TODOS os tickets, inclusive os
  // sem viagem vinculada (~52% não têm trip_id; o EXISTS no window_end da viagem os derrubava → era
  // o motivo do filtro "não funcionar"). occurred_at é wall-clock de Brasília como UTC → bounds UTC.
  if (f.inicio || f.fim) {
    conditions.push(prazoRangeSql(sql`${alerts.occurredAt}`, f.inicio, f.fim))
  }

  if (f.clientName || f.routeCode) {
    const tripConditions = []
    if (f.clientName) {
      const [c] = await db.select({ id: clients.id }).from(clients).where(eq(clients.name, f.clientName)).limit(1)
      tripConditions.push(c ? eq(trips.clientId, c.id) : sql`false`)
    }
    if (f.routeCode) {
      const [r] = await db.select({ id: routes.id }).from(routes).where(eq(routes.code, f.routeCode)).limit(1)
      tripConditions.push(r ? eq(trips.routeId, r.id) : sql`false`)
    }
    const matchingTrips = await db.select({ id: trips.id }).from(trips).where(and(...tripConditions))
    if (matchingTrips.length === 0) {
      conditions.push(sql`false`)
    } else {
      conditions.push(inArray(alerts.tripId, matchingTrips.map(t => t.id)))
    }
  }

  if (f.search) {
    conditions.push(or(
      ilike(alerts.title, `%${f.search}%`),
      ilike(alerts.description, `%${f.search}%`),
    )!)
  }

  const where = conditions.length ? and(...conditions) : undefined

  const rows = await db.query.alerts.findMany({
    where,
    with: {
      trip:    { columns: { code: true, sheetLh: true } },
      driver:  { columns: { id: true, name: true, photoUrl: true } },
      vehicle: { columns: { plate: true } },
      assignee: { columns: { name: true } },
    },
    orderBy: (a, { desc }) => [desc(a.occurredAt)],
    limit: 500,
  })

  const tripIds = [...new Set(rows.map(r => r.tripId).filter((x): x is string => !!x))]
  const tripRows = tripIds.length
    ? await db.query.trips.findMany({
        where: (t, { inArray }) => inArray(t.id, tripIds),
        with: { client: { columns: { name: true } }, route: { columns: { code: true } } },
      })
    : []
  const tripMap = new Map(tripRows.map(t => [t.id, t]))

  // Phase 14 — meta cruzada da viagem p/ a ocorrência. Crítico p/ Shopee: esses tickets vêm
  // dos detectores GPS e NÃO trazem painelMeta (HistoricoTickets), então o operador via quase nada.
  // Coalesce entre os gêmeos por LH/motorista: identidade (cavalo/carreta/origem/destino/ID Shopee/
  // status Cargas) de qualquer fonte; SLA/tracking (prazo/ETA/atraso/progresso/distância) preferindo
  // o PAINEL (prazo real, mesma regra do mergeGroup em trips.service). Read-time pois uq_trips_sheet_lh
  // impede persistir o mesmo LH em 2 trips.
  type TripMetaRow = {
    id: string; lh: string | null
    origin: string | null; destination: string | null
    cavalo: string | null; carreta: string | null; shopee_driver_id: string | null
    cargas_status: string | null; sla_status: string | null
    window_end: Date | null; eta: Date | null; departed_at: Date | null
    adiantamento_horas: string | null; progress_pct: number | null
    distance_total: string | null; distance_done: string | null
  }
  const metaByTripId = new Map<string, TripMetaRow>()
  if (tripIds.length) {
    const metaRows = (await db.execute(sql`
      SELECT t.id,
        COALESCE(t.sheet_lh, p.sheet_lh, cg.sheet_lh)                          AS lh,
        COALESCE(p.origin, cg.origin, t.origin)                               AS origin,
        COALESCE(p.destination, cg.destination, t.destination)                AS destination,
        COALESCE(t.sheet_cavalo, cg.sheet_cavalo, p.sheet_cavalo)             AS cavalo,
        COALESCE(t.sheet_carreta, cg.sheet_carreta, p.sheet_carreta)          AS carreta,
        COALESCE(t.shopee_driver_id, cg.shopee_driver_id, p.shopee_driver_id) AS shopee_driver_id,
        COALESCE(cg.cargas_status, t.cargas_status, p.cargas_status)          AS cargas_status,
        COALESCE(p.sla_status, t.sla_status, cg.sla_status)                   AS sla_status,
        COALESCE(p.window_end, t.window_end)                                  AS window_end,
        COALESCE(p.eta, t.eta, cg.eta)                                        AS eta,
        COALESCE(p.departed_at, t.departed_at, cg.departed_at)                AS departed_at,
        COALESCE(p.adiantamento_horas, t.adiantamento_horas)                  AS adiantamento_horas,
        COALESCE(p.progress_pct, t.progress_pct)                              AS progress_pct,
        COALESCE(p.distance_total, t.distance_total, cg.distance_total)       AS distance_total,
        COALESCE(p.distance_done, t.distance_done, cg.distance_done)          AS distance_done
      FROM trips t
      LEFT JOIN LATERAL (
        SELECT * FROM trips x
        WHERE x.source = 'painel' AND x.id <> t.id
          AND ( (t.sheet_lh IS NOT NULL AND x.sheet_lh = t.sheet_lh)
             OR (t.linked_lh IS NOT NULL AND x.sheet_lh = t.linked_lh)
             OR x.code = 'PNLA-' || t.code OR x.code = 'PNLC-' || t.code )
        ORDER BY x.updated_at DESC LIMIT 1
      ) p ON TRUE
      LEFT JOIN LATERAL (
        SELECT * FROM trips x
        WHERE x.source = 'cargas' AND x.id <> t.id
          AND ( (t.sheet_lh IS NOT NULL AND x.sheet_lh = t.sheet_lh)
             OR (t.linked_lh IS NOT NULL AND x.linked_lh = t.linked_lh)
             OR ( t.status = 'in_progress' AND t.sheet_motorista IS NOT NULL
                  AND upper(translate(trim(x.sheet_motorista), ${sql.raw(ACC)})) = upper(translate(trim(t.sheet_motorista), ${sql.raw(ACC)}))
                  AND (x.cargas_status IS NULL OR x.cargas_status NOT IN ('DESCARREGADO', 'CANCELADO', 'NO SHOW')) ) )
        ORDER BY x.updated_at DESC LIMIT 1
      ) cg ON TRUE
      WHERE t.id IN (${sql.join(tripIds.map(id => sql`${id}`), sql`, `)})
    `)) as unknown as TripMetaRow[]
    for (const m of metaRows) metaByTripId.set(m.id, m)
  }

  return rows.map(r => {
    const trip = r.tripId ? tripMap.get(r.tripId) : undefined
    const meta = r.tripId ? metaByTripId.get(r.tripId) : undefined
    const distTotal = meta?.distance_total != null ? Number(meta.distance_total) : undefined
    const distDone  = meta?.distance_done  != null ? Number(meta.distance_done)  : undefined
    const kmFalta   = distTotal != null && distDone != null ? Math.max(0, distTotal - distDone) : undefined
    const adiant    = meta?.adiantamento_horas != null ? Number(meta.adiantamento_horas) : undefined
    return {
      id:           r.id,
      type:         r.type,
      severity:     r.severity,
      status:       r.status,
      priority:     r.priority ?? 'media',
      tripId:       r.tripId ?? '',
      tripCode:     r.trip?.code ?? '',
      lh:           r.trip?.sheetLh ?? meta?.lh ?? '',
      driverId:     r.driverId ?? '',
      // Fontes vivas não populam alert.driver_id — cai p/ o nome da planilha (sheet_motorista).
      driverName:   r.driver?.name ?? trip?.sheetMotorista ?? '',
      driverPhoto:  r.driver?.photoUrl ?? undefined,
      plate:        r.vehicle?.plate ?? (r.painelMeta as { placa?: string } | null)?.placa ?? meta?.cavalo ?? '',
      clientName:   trip?.client?.name ?? '',
      routeCode:    trip?.route?.code ?? '',
      title:        r.title,
      description:  r.description ?? '',
      source:       r.source ?? 'GPS',
      lat:          r.lat ? Number(r.lat) : undefined,
      lng:          r.lng ? Number(r.lng) : undefined,
      delayMinutes: r.delayMinutes ?? undefined,
      deviationKm:  r.deviationKm ? Number(r.deviationKm) : undefined,
      occurredAt:   r.occurredAt,
      slaDeadline:  r.slaDeadline ?? undefined,
      assignedTo:   r.assignedTo ?? undefined,
      assignedToName: (r as { assignee?: { name?: string } }).assignee?.name ?? undefined,
      resolvedAt:   r.resolvedAt ?? undefined,
      // Phase 14 — dados do ticket do painel (atraso/km/placa/origem/destino/operador)
      painelMeta:   r.painelMeta ?? undefined,
      // Phase 14 — meta cruzada da viagem (preenche tickets Shopee/GPS sem painelMeta)
      tripMeta:     meta ? {
        origem:            meta.origin ?? undefined,
        destino:           meta.destination ?? undefined,
        cavalo:            meta.cavalo ?? undefined,
        carreta:           meta.carreta ?? undefined,
        shopeeDriverId:    meta.shopee_driver_id ?? undefined,
        cargasStatus:      meta.cargas_status ?? undefined,
        slaStatus:         meta.sla_status ?? undefined,
        windowEnd:         meta.window_end ?? undefined,
        eta:               meta.eta ?? undefined,
        departedAt:        meta.departed_at ?? undefined,
        adiantamentoHoras: adiant,
        progressPct:       meta.progress_pct ?? undefined,
        kmFalta:           kmFalta,
        distanceTotal:     distTotal,
      } : undefined,
    }
  })
}

/**
 * Uma ocorrência por id, com o MESMO enriquecimento do listAlerts (reusa a função
 * filtrando por id → zero duplicação e não esbarra no teto de 500). Para deep-link
 * (ex.: clicar num log de auditoria que aponta p/ um ticket antigo/resolvido).
 */
export async function getAlertById(id: string) {
  const rows = await listAlerts({ id })
  return rows[0] ?? null
}

export async function assignAlert(alertId: string, userId: string) {
  const [updated] = await db.update(alerts)
    .set({ assignedTo: userId, status: 'em_tratativa' })
    .where(eq(alerts.id, alertId))
    .returning()
  return updated ?? null
}

/**
 * Assume TODAS as ocorrências ABERTAS de uma viagem de uma vez (D-14) — o operador
 * trata a viagem inteira num clique. Recebe os ids do grupo (o front já os tem),
 * filtra só as não-resolvidas, atribui ao operador e move p/ em_tratativa.
 */
export async function assignAlertsBulk(ids: string[], userId: string): Promise<{ count: number }> {
  const clean = [...new Set((ids ?? []).filter(Boolean))]
  if (clean.length === 0) return { count: 0 }
  const updated = await db.update(alerts)
    .set({ assignedTo: userId, status: 'em_tratativa' })
    .where(and(inArray(alerts.id, clean), sql`${alerts.status} NOT IN ('resolvido', 'encerrado')`))
    .returning({ id: alerts.id })
  return { count: updated.length }
}

export async function addTreatment(alertId: string, operatorId: string, body: { actionType?: string; notes?: string; outcome?: string }) {
  const alertRow = await db.query.alerts.findFirst({ where: eq(alerts.id, alertId) })
  if (!alertRow) return null
  const [t] = await db.insert(treatments).values({
    alertId,
    tripId:     alertRow.tripId,
    operatorId,
    actionType: body.actionType,
    notes:      body.notes,
    outcome:    body.outcome,
  }).returning()
  return t
}

export async function resolveAlert(alertId: string) {
  const [r] = await db.update(alerts)
    .set({ status: 'resolvido', resolvedAt: new Date() })
    .where(eq(alerts.id, alertId))
    .returning()
  return r ?? null
}

export async function getAlertStats() {
  const all = await db.select().from(alerts)
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
  const terminal = new Set(['resolvido', 'encerrado'])
  const criticos       = all.filter(a => a.severity === 'critico' && !terminal.has(a.status)).length
  const abertos        = all.filter(a => a.status === 'aberto').length
  const emAnalise      = all.filter(a => a.status === 'em_analise').length
  const emTratativa    = all.filter(a => a.status === 'em_tratativa').length
  const resolvidos     = all.filter(a => a.status === 'resolvido').length
  const encerrados     = all.filter(a => a.status === 'encerrado').length
  const resolvidosHoje = all.filter(a => a.resolvedAt && a.resolvedAt >= startToday).length
  const closed   = all.filter(a => terminal.has(a.status) && a.slaDeadline && a.resolvedAt)
  const onTime   = closed.filter(a => a.resolvedAt! <= a.slaDeadline!).length
  const slaPct   = closed.length ? Math.round((onTime / closed.length) * 100) : 100

  const altaPrio  = all.filter(a => (a.priority ?? 'media') === 'alta' && !terminal.has(a.status)).length
  const mediaPrio = all.filter(a => (a.priority ?? 'media') === 'media' && !terminal.has(a.status)).length
  const baixaPrio = all.filter(a => (a.priority ?? 'media') === 'baixa' && !terminal.has(a.status)).length

  return {
    criticos:       { count: criticos },
    abertos:        { count: abertos },
    resolvidosHoje: { count: resolvidosHoje },
    slaTratativas:  { pct: slaPct },
    // Sprint 2: status breakdown for ocorrências dashboard
    byStatus:       { aberto: abertos, em_analise: emAnalise, em_tratativa: emTratativa, resolvido: resolvidos, encerrado: encerrados },
    byPriority:     { alta: altaPrio, media: mediaPrio, baixa: baixaPrio },
  }
}

/**
 * Cria uma ocorrência manual (Phase 12, D-12-29) — operador abrindo ocorrência
 * a partir de uma viagem. status/priority usam defaults do schema.
 */
export async function createAlert(input: {
  type: string
  severity: 'critico' | 'medio' | 'baixo'
  title: string
  description?: string
  tripId?: string | null
  driverId?: string | null
  priority?: 'alta' | 'media' | 'baixa'
}) {
  const [row] = await db.insert(alerts).values({
    type:        input.type,
    severity:    input.severity,
    title:       input.title,
    description: input.description ?? null,
    tripId:      input.tripId ?? null,
    driverId:    input.driverId ?? null,
    source:      'Manual',
    priority:    input.priority ?? 'media',
    // mesmo convênio dos tickets do painel (wall-clock de Brasília rotulado UTC) p/ exibir certo
    occurredAt:  brWallNow(),
  }).returning()
  return row
}
