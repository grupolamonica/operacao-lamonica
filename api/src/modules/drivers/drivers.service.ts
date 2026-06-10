import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { drivers } from '../../db/schema/drivers'
import { getRankingDrivers } from '../ranking/ranking.service'
import { normalizeMotorista } from '../positions/viagens.parser'

export type DriverFilters = {
  status?: 'available'|'on_route'|'unavailable'
  base?:   string
  search?: string
}

// Pares from/to do translate() p/ strip de acentos no Postgres (mesma normalização do normalizeMotorista).
const ACC = "'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç','AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'"

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

  // Phase 14 — enriquecimento p/ a tabela: Viagens (count) + Rank (do ranking, por nome).
  // Cruza pelas 3 chaves (mesma lógica do dossiê): driver_id, shopee_driver_id e
  // sheet_motorista normalizado (viagens vivas do painel/cargas só têm o nome texto).
  // UNION de equi-joins (hash join) — OR-join único vira nested loop e estoura statement timeout.
  // O UNION dedup (trip_id, driver_id): trip que casa por mais de uma chave conta 1x.
  const tripCounts = new Map<string, number>()
  const tc = (await db.execute(sql`
    WITH dn AS (
      SELECT id, shopee_driver_id, upper(translate(trim(name), ${sql.raw(ACC)})) AS nm FROM drivers
    ), tn AS (
      SELECT id, driver_id, shopee_driver_id,
             nullif(upper(translate(trim(sheet_motorista), ${sql.raw(ACC)})), '') AS nm
      FROM trips
    ), m AS (
      SELECT tn.id AS trip_id, dn.id AS driver_id FROM tn JOIN dn ON dn.id = tn.driver_id
      UNION
      SELECT tn.id, dn.id FROM tn JOIN dn ON dn.shopee_driver_id IS NOT NULL AND tn.shopee_driver_id = dn.shopee_driver_id
      UNION
      SELECT tn.id, dn.id FROM tn JOIN dn ON tn.nm IS NOT NULL AND tn.nm = dn.nm
    )
    SELECT driver_id, count(*)::int AS n FROM m GROUP BY driver_id
  `)) as unknown as Array<{ driver_id: string; n: number }>
  for (const r of tc) tripCounts.set(r.driver_id, Number(r.n))

  // Ranking por nome normalizado (o `nome` do ranking traz " (id)" no fim — strip antes).
  const rankByName = new Map<string, { rank: number | null; pontuacao: number | null; vinculo: string | null }>()
  try {
    const ranked = await getRankingDrivers()
    for (const r of ranked) {
      rankByName.set(normalizeMotorista(r.nome.replace(/\s*\(\d+\)\s*$/, '')), {
        rank: r.rank ?? null, pontuacao: r.pontuacao ?? null, vinculo: r.vinculo ?? null,
      })
    }
  } catch { /* ranking indisponível — segue sem rank */ }

  return rows.map(d => {
    const rk = rankByName.get(normalizeMotorista(d.name))
    return ({
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
    // Phase 14 — tabela Motoristas: Vínculo / Viagens / Rank (cruzado com o ranking)
    vinculo:             d.driverKind ?? rk?.vinculo ?? undefined,
    viagens:             tripCounts.get(d.id) ?? 0,
    rank:                rk?.rank ?? null,
    pontuacao:           rk?.pontuacao ?? null,
  })
  })
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
/**
 * Resolve o dossiê pelo NOME do motorista (viagens do painel não têm driverId, só sheet_motorista).
 * Casa exato primeiro, depois por similaridade (ILIKE), normalizando acentos.
 */
export async function getDriverDossieByName(name: string) {
  const nm = (name ?? '').trim()
  if (!nm) return null
  let [d] = (await db.execute(sql`
    SELECT id FROM drivers
    WHERE upper(translate(trim(name), ${sql.raw(ACC)})) = upper(translate(trim(${nm}), ${sql.raw(ACC)}))
    LIMIT 1
  `)) as unknown as Array<{ id: string }>
  if (!d) [d] = await db.select({ id: drivers.id }).from(drivers).where(ilike(drivers.name, `%${nm}%`)).limit(1)
  return d ? getDriverDossie(d.id) : null
}

export async function getDriverDossie(id: string) {
  const n = (v: unknown) => Number(v ?? 0)

  const [d] = (await db.execute(sql`
    SELECT id, code, name, cpf, cnh, cnh_categoria, cnh_validade, rg, nascimento,
           driver_kind, cidade, estado, phone, email, status, operational_score, base,
           tracking_enabled, documents_valid, antt_valid, insurance_valid,
           operational_blocked, angellira_status, angellira_valid_until, shopee_driver_id,
           lat, lng, address
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

  const documentos = (await db.execute(sql`
    SELECT type, status, expires_at, issued_at
    FROM driver_documents WHERE driver_id = ${id}
    ORDER BY expires_at NULLS LAST
  `)) as unknown as any[]

  const [pos] = (await db.execute(sql`
    SELECT data_posicao, cidade, uf, veiculo, lat, lng
    FROM driver_positions
    WHERE motorista_norm = upper(${d.name}) OR motorista ILIKE ${'%' + (d.name ?? '') + '%'}
    ORDER BY data_posicao DESC LIMIT 1
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
      avgRanking: null,
      totalValor: Number(t.total_valor ?? 0),
      recentes: recentes.map((r) => ({
        code: r.code, origin: r.origin, destination: r.destination,
        status: r.status, slaStatus: r.sla_status,
        windowStart: r.window_start, eta: r.eta,
        valor: r.valor != null ? Number(r.valor) : null,
        rankingScore: typeof r.ranking_score === 'number' ? r.ranking_score : null,
        sheetLh: r.sheet_lh, cavalo: r.sheet_cavalo, carreta: r.sheet_carreta,
      })),
    },
    veiculos: veiculos.map((v) => ({
      plate: v.plate, type: v.type, model: v.model ?? v.angellira_display_name ?? null,
      plateRole: v.plate_role, angelliraStatus: v.angellira_status ?? null,
      angelliraValidUntil: v.angellira_valid_until ?? null,
    })),
    documentos: documentos.map((doc) => ({
      type: doc.type, status: doc.status,
      expiresAt: doc.expires_at ?? null, issuedAt: doc.issued_at ?? null,
    })),
    localizacao: {
      address: d.address ?? null,
      lat: d.lat != null ? Number(d.lat) : (pos?.lat != null ? Number(pos.lat) : null),
      lng: d.lng != null ? Number(d.lng) : (pos?.lng != null ? Number(pos.lng) : null),
      ultimaPosicao: pos
        ? { at: pos.data_posicao ?? null, cidade: pos.cidade ?? null, uf: pos.uf ?? null, veiculo: pos.veiculo ?? null }
        : null,
    },
    ocorrencias: alertas.map((a) => ({
      type: a.type, severity: a.severity, status: a.status, title: a.title,
      occurredAt: a.occurred_at, resolvedAt: a.resolved_at ?? null,
    })),
  }
}

export async function getDriverStats() {
  // Semântica Phase 14 (D-14):
  //  Disponíveis = candidatos a cargas abertas no Cargas (cross-ref CPF)
  //  Em rota     = motoristas distintos com viagem in_progress (com carga + acompanhamento)
  //  Com atraso  = motoristas com viagem in_progress atrasada na Torre
  //  Docs vencendo = CNH/Angellira vencendo (≤30d) OU vencida
  // Viagens vivas (painel/cargas/monitoring) não têm driver_id — só sheet_motorista (texto).
  // Chave distinta = COALESCE(driver_id, nome normalizado).
  const allDrivers = await db.select().from(drivers)
  const ativos = allDrivers.filter(d => d.status !== 'unavailable').length
  const n = (v: unknown) => Number(v ?? 0)

  const [disp] = (await db.execute(sql`
    SELECT count(DISTINCT d.id)::int AS c
    FROM drivers d
    JOIN cargas_load_candidates c ON c.driver_cpf = d.cpf
    WHERE c.status = 'QUEUED'
  `)) as unknown as Array<{ c: number }>

  const [rota] = (await db.execute(sql`
    SELECT count(DISTINCT coalesce(driver_id::text, nullif(upper(translate(trim(sheet_motorista), ${sql.raw(ACC)})), '')))::int AS c
    FROM trips
    WHERE status = 'in_progress'
  `)) as unknown as Array<{ c: number }>

  const [atr] = (await db.execute(sql`
    SELECT count(DISTINCT coalesce(driver_id::text, nullif(upper(translate(trim(sheet_motorista), ${sql.raw(ACC)})), '')))::int AS c
    FROM trips
    WHERE status = 'in_progress' AND sla_status = 'atrasado'
  `)) as unknown as Array<{ c: number }>

  const [docs] = (await db.execute(sql`
    SELECT count(*)::int AS c FROM drivers
    WHERE (cnh_validade IS NOT NULL AND cnh_validade <= CURRENT_DATE + INTERVAL '30 days')
       OR (angellira_valid_until IS NOT NULL AND angellira_valid_until <= CURRENT_DATE + INTERVAL '30 days')
  `)) as unknown as Array<{ c: number }>

  return {
    ativos:             { count: ativos, total: allDrivers.length },
    disponiveis:        { count: n(disp?.c) },
    emRota:             { count: n(rota?.c) },
    comAtraso:          { count: n(atr?.c) },
    documentosVencendo: { count: n(docs?.c) },
  }
}
