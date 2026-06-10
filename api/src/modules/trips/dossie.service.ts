/**
 * Dossiê COMPLETO da viagem (D-14) — cruza as 3 bases e devolve TUDO que existe:
 *   • Torre   — trip + drivers (cadastro + vigência Angellira) + vehicles (por placa)
 *   • Ranking — posição + pontuação do motorista (por nome normalizado)
 *   • Cargas  — carga completa (por LH) + sheet_monitor_enriched POR PLACA (marca/modelo/
 *               chassi/renavam/cor/ANTT/anos/licenciamento/vigência) + motoristas_historico
 *               (cadastro Cargas por nome: CNH/RG/nascimento/segurança/vigência Angellira)
 *
 * Veículos cruzam por PLACA (não LH) — o enriched é snapshot keyed por LH e pode
 * estar defasado (reuso de LH no cutover). Motorista cruza por nome (torre = master).
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
  marca: string | null
  modelo: string | null
  marcaModelo: string | null
  chassi: string | null
  renavam: string | null
  anoFab: number | null
  anoModelo: number | null
  cor: string | null
  antt: string | null
  classificacao: string | null
  ultimoLicenciamento: string | null
  angellira: string | null       // Conforme | ...
  vigenteAte: string | null      // "Vigente até" (angellira_valid_until)
}

export interface TripDossie {
  lh: string | null
  carga: Record<string, unknown> | null
  motorista: {
    nome: string
    cpf: string | null
    rg: string | null
    cnh: string | null
    cnhCategoria: string | null
    cnhValidade: string | null
    nascimento: string | null
    vinculo: string | null
    cidade: string | null
    estado: string | null
    cidadeUf: string | null
    telefone: string | null
    email: string | null
    score: number | null
    bloqueado: boolean | null
    angellira: string | null
    vigenteAte: string | null
    rankPosicao: number | null
    rankPontuacao: number | null
    // cadastro Cargas (motoristas_historico, por nome) — campos extras quando casar
    cargas: Record<string, unknown> | null
  } | null
  cavalo: VeiculoDossie | null
  carreta: VeiculoDossie | null
}

function toVeiculo(plate: string | null, papel: 'cavalo' | 'carreta', torre: any, enr: any): VeiculoDossie | null {
  if (!plate || !plate.trim()) return null
  const d = enr?.details?.angellira_details ?? {}
  const marca = d.brand ?? null
  const modelo = d.model ?? torre?.model ?? null
  return {
    placa: plate,
    papel,
    tipo: torre?.type ?? d.type ?? null,
    marca,
    modelo,
    marcaModelo: torre?.angellira_display_name ?? ([marca, modelo].filter(Boolean).join(' ') || torre?.model || null),
    chassi: d.chassis ?? null,
    renavam: d.renavam ?? null,
    anoFab: d.fabricationYear ? Number(d.fabricationYear) : null,
    anoModelo: d.modelYear ? Number(d.modelYear) : null,
    cor: d.color ?? null,
    antt: d.antt ?? null,
    classificacao: d.classification ?? null,
    ultimoLicenciamento: d.lastLicensing ?? null,
    angellira: torre?.angellira_status ?? enr?.details?.angellira_status_text ?? d.conformanceStatus ?? null,
    vigenteAte: torre?.angellira_valid_until ?? enr?.validUntil ?? null,
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
  const sb = getCargasSupabase()

  // --- CARGA completa (Cargas, por LH) ---
  let carga: Record<string, unknown> | null = null
  if (lh) {
    try {
      const { data } = await sb.from('cargas').select('*').eq('sheet_lh', lh).limit(1)
      carga = data?.[0] ?? null
    } catch { /* Cargas indisponível */ }
  }

  // --- VEÍCULOS (torre vehicles por placa + enriched por placa) ---
  const vehTorre = async (plate: string | null) => {
    if (!plate?.trim()) return null
    const [v] = (await db.execute(sql`
      SELECT plate, type, model, angellira_status, angellira_valid_until, angellira_display_name
      FROM vehicles WHERE upper(replace(replace(plate, '-', ''), ' ', '')) = ${plt(plate)} LIMIT 1
    `)) as unknown as any[]
    return v ?? null
  }
  const enrByPlate = async (plate: string | null): Promise<any> => {
    if (!plate?.trim()) return null
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
  const [cavTorre, cavEnr, carTorre, carEnr] = await Promise.all([
    vehTorre(t.sheet_cavalo), enrByPlate(t.sheet_cavalo),
    vehTorre(t.sheet_carreta), enrByPlate(t.sheet_carreta),
  ])

  // --- MOTORISTA (torre drivers + ranking + cadastro Cargas por nome) ---
  let motorista: TripDossie['motorista'] = null
  if (motN) {
    const [drv] = (await db.execute(sql`
      SELECT name, cpf, rg, cnh, cnh_categoria, cnh_validade, nascimento, driver_kind, cidade, estado,
             phone, email, operational_score, operational_blocked, angellira_status, angellira_valid_until
      FROM drivers WHERE upper(translate(trim(name), ${sql.raw(ACC)})) = ${motN} LIMIT 1
    `)) as unknown as any[]
    let rk: any = null
    try {
      const ranking = await getRankingDrivers()
      rk = ranking.find((r: any) => nrm(String(r.nome).replace(/\s*\(\d+\)\s*$/, '')) === motN)
    } catch { /* ranking indisponível */ }
    // cadastro Cargas (motoristas_historico) por nome normalizado — pode não casar (CPFs divergem)
    let cargasMot: Record<string, unknown> | null = null
    try {
      const { data } = await sb.from('motoristas_historico')
        .select('cpf, nome, cnh, cnh_validade, cnh_categoria, cnh_security, rg, telefone, nascimento, driver_kind, cidade, estado, angellira_sent_date, angellira_limit_date, aspx_found, aspx_display_name')
        .ilike('nome', `%${t.sheet_motorista}%`).limit(1)
      cargasMot = data?.[0] ?? null
    } catch { /* tabela ausente */ }
    motorista = {
      nome: (t.sheet_motorista ?? drv?.name ?? '').trim(),
      cpf: drv?.cpf ?? null,
      rg: drv?.rg ?? null,
      cnh: drv?.cnh ?? null,
      cnhCategoria: drv?.cnh_categoria ?? null,
      cnhValidade: drv?.cnh_validade ?? null,
      nascimento: drv?.nascimento ?? null,
      vinculo: drv?.driver_kind ?? null,
      cidade: drv?.cidade ?? null,
      estado: drv?.estado ?? null,
      cidadeUf: [drv?.cidade, drv?.estado].filter(Boolean).join('/') || null,
      telefone: drv?.phone ?? null,
      email: drv?.email ?? null,
      score: drv?.operational_score != null ? Number(drv.operational_score) : null,
      bloqueado: drv?.operational_blocked ?? null,
      angellira: drv?.angellira_status ?? null,
      vigenteAte: drv?.angellira_valid_until ?? null,
      rankPosicao: rk?.rank ?? null,
      rankPontuacao: rk?.pontuacao ?? null,
      cargas: cargasMot,
    }
  }

  return {
    lh,
    carga,
    motorista,
    cavalo: toVeiculo(t.sheet_cavalo, 'cavalo', cavTorre, cavEnr),
    carreta: toVeiculo(t.sheet_carreta, 'carreta', carTorre, carEnr),
  }
}
