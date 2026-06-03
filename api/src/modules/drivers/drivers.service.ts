import { and, eq, ilike, or } from 'drizzle-orm'
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
