import { and, eq, gte, ilike, or, sql, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import { alerts } from '../../db/schema/alerts'
import { treatments } from '../../db/schema/treatments'
import { trips } from '../../db/schema/trips'
import { clients } from '../../db/schema/clients'
import { routes } from '../../db/schema/routes'

// Pares from/to do translate() p/ strip de acentos no Postgres (mesma normalização do normalizeMotorista).
const ACC = "'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç','AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'"

export type AlertFilters = {
  severity?:   'critico'|'medio'|'baixo'
  status?:     'aberto'|'em_analise'|'em_tratativa'|'resolvido'|'encerrado'
  type?:       string
  clientName?: string
  routeCode?:  string
  assignedTo?: string
  period?:     'today'|'7d'|'30d'|'90d'|'tudo'
  search?:     string
}

function periodCutoff(p?: string): Date | null {
  if (!p) return null
  const d = new Date()
  if (p === 'today') { d.setHours(0, 0, 0, 0); return d }
  if (p === '7d')    { d.setDate(d.getDate() - 7);  return d }
  if (p === '30d')   { d.setDate(d.getDate() - 30); return d }
  if (p === '90d')   { d.setDate(d.getDate() - 90); return d }
  // 'tudo' (ou qualquer outro) → sem corte; inclui o histórico de tickets importado do GAS
  return null
}

export async function listAlerts(f: AlertFilters) {
  const conditions = []
  if (f.severity)   conditions.push(eq(alerts.severity, f.severity))
  if (f.status)     conditions.push(eq(alerts.status, f.status))
  if (f.type)       conditions.push(eq(alerts.type, f.type))
  if (f.assignedTo) conditions.push(eq(alerts.assignedTo, f.assignedTo))
  const cutoff = periodCutoff(f.period)
  if (cutoff) conditions.push(gte(alerts.occurredAt, cutoff))

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

  // Phase 14 — LH p/ trips das fontes vivas sem sheet_lh: (a) gêmeo do painel (PNLA/PNLC-<cod>),
  // (b) carga ativa do mesmo motorista (trips source='cargas' por nome normalizado; motorista dirige
  // 1 viagem por vez). Read-time porque uq_trips_sheet_lh impede persistir o mesmo LH em 2 trips.
  const lhByTripId = new Map<string, string>()
  const missingLh = tripRows.filter(t => !t.sheetLh).map(t => t.id)
  if (missingLh.length) {
    const found = (await db.execute(sql`
      SELECT t.id, COALESCE(p.sheet_lh, cg.sheet_lh) AS lh
      FROM trips t
      LEFT JOIN LATERAL (
        SELECT sheet_lh FROM trips
        WHERE source = 'painel' AND sheet_lh IS NOT NULL
          AND (code = 'PNLA-' || t.code OR code = 'PNLC-' || t.code)
        LIMIT 1
      ) p ON TRUE
      LEFT JOIN LATERAL (
        SELECT c.sheet_lh FROM trips c
        WHERE c.source = 'cargas' AND c.sheet_lh IS NOT NULL
          AND t.status = 'in_progress' AND t.sheet_motorista IS NOT NULL
          AND upper(translate(trim(c.sheet_motorista), ${sql.raw(ACC)})) = upper(translate(trim(t.sheet_motorista), ${sql.raw(ACC)}))
          AND (c.cargas_status IS NULL OR c.cargas_status NOT IN ('DESCARREGADO', 'CANCELADO', 'NO SHOW'))
        ORDER BY c.updated_at DESC
        LIMIT 1
      ) cg ON TRUE
      WHERE t.id IN (${sql.join(missingLh.map(id => sql`${id}`), sql`, `)})
    `)) as unknown as Array<{ id: string; lh: string | null }>
    for (const r of found) if (r.lh) lhByTripId.set(r.id, r.lh)
  }

  return rows.map(r => {
    const trip = r.tripId ? tripMap.get(r.tripId) : undefined
    return {
      id:           r.id,
      type:         r.type,
      severity:     r.severity,
      status:       r.status,
      priority:     r.priority ?? 'media',
      tripId:       r.tripId ?? '',
      tripCode:     r.trip?.code ?? '',
      lh:           r.trip?.sheetLh ?? (r.tripId ? lhByTripId.get(r.tripId) : undefined) ?? '',
      driverId:     r.driverId ?? '',
      // Fontes vivas não populam alert.driver_id — cai p/ o nome da planilha (sheet_motorista).
      driverName:   r.driver?.name ?? trip?.sheetMotorista ?? '',
      driverPhoto:  r.driver?.photoUrl ?? undefined,
      plate:        r.vehicle?.plate ?? (r.painelMeta as { placa?: string } | null)?.placa ?? '',
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
    }
  })
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
    occurredAt:  new Date(),
  }).returning()
  return row
}
