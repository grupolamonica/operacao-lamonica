/**
 * Dossiê COMPLETO da viagem (D-14) — cruza as 3 bases numa estrutura só:
 *   • Torre   — trip + drivers (vigência Angellira do motorista) + vehicles (vigência por placa)
 *   • Ranking — posição + pontuação do motorista (por nome normalizado)
 *   • Cargas  — sheet_monitor_enriched POR PLACA (marca/modelo/chassi/renavam/vigência
 *               de cavalo e carreta — os mesmos dados da tela "Motorista" do Cargas)
 *
 * Cruza pelo motorista e PLACAS ATUAIS da viagem (não pelo LH): o enriched é um
 * snapshot keyed por LH que pode estar defasado (reuso de LH no cutover) — casar
 * por placa traz o veículo certo. Vigência do motorista vem de drivers.angellira_valid_until.
 */
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { getCargasSupabase } from '../cargas/cargas.supabase'
import { getRankingDrivers } from '../ranking/ranking.service'

const ACC = "'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç','AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'"
const nrm = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
const plt = (s: string) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export interface VeiculoDossie {
  placa: string | null
  papel: 'cavalo' | 'carreta'
  tipo: string | null
  marcaModelo: string | null
  chassi: string | null
  renavam: string | null
  anoFab: number | null
  anoModelo: number | null
  cor: string | null
  antt: string | null
  angellira: string | null       // Conforme | ...
  vigenteAte: string | null      // "Vigente até" (angellira_valid_until)
}

export interface TripDossie {
  lh: string | null
  motorista: {
    nome: string
    cpf: string | null
    cnh: string | null
    cnhCategoria: string | null
    cnhValidade: string | null
    vinculo: string | null
    cidadeUf: string | null
    telefone: string | null
    score: number | null
    angellira: string | null
    vigenteAte: string | null     // vigência Angellira do motorista
    rankPosicao: number | null
    rankPontuacao: number | null
  } | null
  cavalo: VeiculoDossie | null
  carreta: VeiculoDossie | null
}

async function vehicleByPlate(plate: string | null, papel: 'cavalo' | 'carreta', enrByPlate: (p: string) => Promise<any>): Promise<VeiculoDossie | null> {
  if (!plate || !plate.trim()) return null
  const key = plt(plate)
  const [v] = (await db.execute(sql`
    SELECT plate, type, model, angellira_status, angellira_valid_until, angellira_display_name
    FROM vehicles WHERE upper(replace(replace(plate, '-', ''), ' ', '')) = ${key} LIMIT 1
  `)) as unknown as any[]
  const enr = await enrByPlate(plate)
  const d = enr?.details?.angellira_details ?? {}
  return {
    placa: plate,
    papel,
    tipo: v?.type ?? d.type ?? null,
    marcaModelo: v?.angellira_display_name ?? v?.model ?? ([d.brand, d.model].filter(Boolean).join(' ') || null),
    chassi: d.chassis ?? null,
    renavam: d.renavam ?? null,
    anoFab: d.fabricationYear ? Number(d.fabricationYear) : null,
    anoModelo: d.modelYear ? Number(d.modelYear) : null,
    cor: d.color ?? null,
    antt: d.antt ?? null,
    angellira: v?.angellira_status ?? enr?.details?.angellira_status_text ?? null,
    vigenteAte: v?.angellira_valid_until ?? enr?.validUntil ?? null,
  }
}

export async function getTripDossie(tripId: string): Promise<TripDossie | null> {
  const [t] = (await db.execute(sql`
    SELECT sheet_lh, linked_lh, sheet_motorista, sheet_cavalo, sheet_carreta
    FROM trips WHERE id = ${tripId} LIMIT 1
  `)) as unknown as any[]
  if (!t) return null
  const lh: string | null = t.sheet_lh ?? t.linked_lh ?? null
  const motN = nrm(t.sheet_motorista ?? '')

  // Cargas enriched por PLACA (1 query cobre cavalo+carreta).
  const sb = getCargasSupabase()
  const enrByPlate = async (plate: string): Promise<any> => {
    const k = plt(plate)
    try {
      const { data } = await sb.from('sheet_monitor_enriched')
        .select('cavalo_plate, cavalo_details, cavalo_angellira_valid_until, carreta_plate, carreta_details, carreta_angellira_valid_until')
        .or(`cavalo_plate.ilike.%${plate}%,carreta_plate.ilike.%${plate}%`).limit(1)
      const r = data?.[0]
      if (!r) return null
      if (plt(r.cavalo_plate) === k) return { details: r.cavalo_details, validUntil: r.cavalo_angellira_valid_until }
      if (plt(r.carreta_plate) === k) return { details: r.carreta_details, validUntil: r.carreta_angellira_valid_until }
      return null
    } catch { return null }
  }

  // Motorista (torre) + ranking.
  let motorista: TripDossie['motorista'] = null
  if (motN) {
    const [drv] = (await db.execute(sql`
      SELECT name, cpf, cnh, cnh_categoria, cnh_validade, driver_kind, cidade, estado, phone,
             operational_score, angellira_status, angellira_valid_until
      FROM drivers WHERE upper(translate(trim(name), ${sql.raw(ACC)})) = ${motN} LIMIT 1
    `)) as unknown as any[]
    let rk: any = null
    try {
      const ranking = await getRankingDrivers()
      rk = ranking.find((r: any) => nrm(String(r.nome).replace(/\s*\(\d+\)\s*$/, '')) === motN)
    } catch { /* ranking indisponível */ }
    motorista = {
      nome: (t.sheet_motorista ?? drv?.name ?? '').trim(),
      cpf: drv?.cpf ?? null,
      cnh: drv?.cnh ?? null,
      cnhCategoria: drv?.cnh_categoria ?? null,
      cnhValidade: drv?.cnh_validade ?? null,
      vinculo: drv?.driver_kind ?? null,
      cidadeUf: [drv?.cidade, drv?.estado].filter(Boolean).join('/') || null,
      telefone: drv?.phone ?? null,
      score: drv?.operational_score != null ? Number(drv.operational_score) : null,
      angellira: drv?.angellira_status ?? null,
      vigenteAte: drv?.angellira_valid_until ?? null,
      rankPosicao: rk?.rank ?? null,
      rankPontuacao: rk?.pontuacao ?? null,
    }
  }

  const [cavalo, carreta] = await Promise.all([
    vehicleByPlate(t.sheet_cavalo, 'cavalo', enrByPlate),
    vehicleByPlate(t.sheet_carreta, 'carreta', enrByPlate),
  ])

  return { lh, motorista, cavalo, carreta }
}
