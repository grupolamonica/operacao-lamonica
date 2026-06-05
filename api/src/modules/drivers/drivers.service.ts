import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { drivers } from '../../db/schema/drivers'

export type DriverFilters = {
  status?: 'available'|'on_route'|'unavailable'
  base?:   string
  search?: string
}

export async function listDrivers(f: DriverFilters) {
  const conditions = []
  if (f.status) conditions.push(eq(drivers.status, f.status))
  if (f.base)   conditions.push(eq(drivers.base, f.base))
  if (f.search) conditions.push(or(
    ilike(drivers.name, `%${f.search}%`),
    ilike(drivers.code, `%${f.search}%`),
  )!)

  const where = conditions.length ? and(...conditions) : undefined

  const rows = await db.query.drivers.findMany({
    where,
    with: {
      documents: true,
      vehicles:  { columns: { plate: true, type: true } },
    },
    orderBy: (d, { asc }) => [asc(d.name)],
  })

  return rows.map(d => ({
    id:               d.id,
    code:             d.code,
    name:             d.name,
    phone:            d.phone ?? '',
    email:            d.email ?? undefined,
    photoUrl:         d.photoUrl ?? undefined,
    status:           d.status,
    operationalScore: d.operationalScore,
    plate:            (d.vehicles as any[])?.[0]?.plate ?? '',
    vehicleType:      (d.vehicles as any[])?.[0]?.type ?? '',
    base:             d.base ?? '',
    documents:        d.documents.map((doc: any) => ({
      type:      doc.type,
      status:    doc.status,
      expiresAt: doc.expiresAt,
      issuedAt:  doc.issuedAt ?? undefined,
    })),
    deliveriesToday:  d.deliveriesToday,
    avgDelayMinutes:  d.avgDelayMinutes,
    lat:              d.lat ? Number(d.lat) : 0,
    lng:              d.lng ? Number(d.lng) : 0,
    address:          d.address ?? '',
    // Phase 12 — enriquecimento Lamonica (MH + Angellira)
    cpf:                 d.cpf ?? undefined,
    cnhCategoria:        d.cnhCategoria ?? undefined,
    cnhValidade:         d.cnhValidade ?? undefined,
    cidade:              d.cidade ?? undefined,
    estado:              d.estado ?? undefined,
    driverKind:          d.driverKind ?? undefined,
    angelliraStatus:     d.angelliraStatus ?? undefined,
    documentsValid:      d.documentsValid ?? undefined,
    anttValid:           d.anttValid ?? undefined,
    trackingEnabled:     d.trackingEnabled ?? undefined,
    operationalBlocked:  d.operationalBlocked ?? undefined,
  }))
}

export async function getDriverById(id: string) {
  const list = await listDrivers({})
  return list.find(d => d.id === id) ?? null
}

/**
 * Dossiê consolidado de um motorista (Phase 12 — cruzamento total).
 * Agrega na Torre o que foi consolidado das bases Lamonica:
 * identidade + conformidade (Angellira), viagens (Shopee DBLH), veículos
 * (Cargas), ocorrências e sinal de ranking. Junta por driver_id E shopee_driver_id.
 */
export async function getDriverDossie(id: string) {
  const n = (v: unknown) => Number(v ?? 0)

  const [d] = (await db.execute(sql`
    SELECT id, code, name, cpf, cnh, cnh_categoria, cnh_validade, rg, nascimento,
           driver_kind, cidade, estado, phone, email, status, operational_score, base,
           tracking_enabled, documents_valid, antt_valid, insurance_valid,
           operational_blocked, angellira_status, angellira_valid_until, shopee_driver_id
    FROM drivers WHERE id = ${id}
  `)) as unknown as any[]
  if (!d) return null

  const shopee: string | null = d.shopee_driver_id ?? null
  const cpf: string | null = d.cpf ?? null

  const [tr] = (await db.execute(sql`
    SELECT count(*)::int                                                  AS total,
           count(*) FILTER (WHERE status='completed')::int               AS completas,
           count(*) FILTER (WHERE status='cancelled')::int               AS canceladas,
           count(*) FILTER (WHERE status='in_progress')::int             AS em_andamento,
           count(*) FILTER (WHERE sla_status='no_prazo')::int            AS no_prazo,
           count(*) FILTER (WHERE sla_status='atrasado')::int            AS atrasadas,
           min(window_start)                                             AS primeira,
           max(window_start)                                             AS ultima,
           count(DISTINCT sheet_lh)::int                                 AS qtd_lh,
           round(avg(ranking_score)::numeric, 1)                         AS avg_ranking,
           coalesce(round(sum(valor)::numeric, 2), 0)                    AS total_valor
    FROM trips
    WHERE driver_id = ${id} OR (${shopee}::text IS NOT NULL AND shopee_driver_id = ${shopee})
  `)) as unknown as any[]

  const recentes = (await db.execute(sql`
    SELECT code, origin, destination, status, sla_status, window_start, eta, valor,
           ranking_score, sheet_lh, sheet_cavalo, sheet_carreta
    FROM trips
    WHERE driver_id = ${id} OR (${shopee}::text IS NOT NULL AND shopee_driver_id = ${shopee})
    ORDER BY window_start DESC NULLS LAST
    LIMIT 10
  `)) as unknown as any[]

  const alertas = (await db.execute(sql`
    SELECT type, severity, status, title, occurred_at, resolved_at
    FROM alerts WHERE driver_id = ${id}
    ORDER BY occurred_at DESC LIMIT 20
  `)) as unknown as any[]

  const veiculos = (await db.execute(sql`
    SELECT plate, type, model, plate_role, angellira_status, angellira_valid_until,
           angellira_display_name
    FROM vehicles
    WHERE driver_id = ${id} OR (${cpf}::text IS NOT NULL AND linked_driver_cpf = ${cpf})
    ORDER BY plate_role NULLS LAST, plate
  `)) as unknown as any[]

  const t = tr ?? {}
  const comSla = n(t.no_prazo) + n(t.atrasadas)
  const pctNoPrazo = comSla > 0 ? Math.round((n(t.no_prazo) / comSla) * 1000) / 10 : null

  return {
    identidade: {
      id: d.id, code: d.code, name: d.name,
      cpf: d.cpf ?? null, rg: d.rg ?? null,
      cnh: d.cnh ?? null, cnhCategoria: d.cnh_categoria ?? null, cnhValidade: d.cnh_validade ?? null,
      nascimento: d.nascimento ?? null, driverKind: d.driver_kind ?? null,
      cidade: d.cidade ?? null, estado: d.estado ?? null,
      phone: d.phone ?? null, email: d.email ?? null,
      shopeeDriverId: d.shopee_driver_id ?? null,
    },
    conformidade: {
      status: d.status,
      operationalScore: n(d.operational_score),
      angelliraStatus: d.angellira_status ?? null,
      angelliraValidUntil: d.angellira_valid_until ?? null,
      anttValid: d.antt_valid ?? null,
      documentsValid: d.documents_valid ?? null,
      insuranceValid: d.insurance_valid ?? null,
      trackingEnabled: d.tracking_enabled ?? null,
      operationalBlocked: d.operational_blocked ?? null,
    },
    viagens: {
      total: n(t.total), completas: n(t.completas), canceladas: n(t.canceladas),
      emAndamento: n(t.em_andamento), noPrazo: n(t.no_prazo), atrasadas: n(t.atrasadas),
      pctNoPrazo, qtdLh: n(t.qtd_lh),
      primeira: t.primeira ?? null, ultima: t.ultima ?? null,
      avgRanking: t.avg_ranking != null ? Number(t.avg_ranking) : null,
      totalValor: Number(t.total_valor ?? 0),
      recentes: recentes.map((r) => ({
        code: r.code, origin: r.origin, destination: r.destination,
        status: r.status, slaStatus: r.sla_status,
        windowStart: r.window_start, eta: r.eta,
        valor: r.valor != null ? Number(r.valor) : null,
        rankingScore: r.ranking_score != null ? Number(r.ranking_score) : null,
        sheetLh: r.sheet_lh, cavalo: r.sheet_cavalo, carreta: r.sheet_carreta,
      })),
    },
    veiculos: veiculos.map((v) => ({
      plate: v.plate, type: v.type, model: v.model ?? v.angellira_display_name ?? null,
      plateRole: v.plate_role, angelliraStatus: v.angellira_status ?? null,
      angelliraValidUntil: v.angellira_valid_until ?? null,
    })),
    ocorrencias: alertas.map((a) => ({
      type: a.type, severity: a.severity, status: a.status, title: a.title,
      occurredAt: a.occurred_at, resolvedAt: a.resolved_at ?? null,
    })),
  }
}

export async function getDriverStats() {
  const allDrivers = await db.select().from(drivers)
  const ativos       = allDrivers.filter(d => d.status !== 'unavailable').length
  const disponiveis  = allDrivers.filter(d => d.status === 'available').length
  const emRota       = allDrivers.filter(d => d.status === 'on_route').length
  const comAtraso    = allDrivers.filter(d => d.avgDelayMinutes > 10).length

  const docsResult = await db.execute(
    `SELECT COUNT(*)::int AS count FROM driver_documents WHERE status = 'vence_em_breve' OR (expires_at IS NOT NULL AND expires_at <= CURRENT_DATE + INTERVAL '30 days')`
  )
  const documentosVencendo = Number((docsResult as any)?.[0]?.count ?? 0)

  return {
    ativos:             { count: ativos, total: allDrivers.length },
    disponiveis:        { count: disponiveis },
    emRota:             { count: emRota },
    comAtraso:          { count: comAtraso },
    documentosVencendo: { count: documentosVencendo },
  }
}
