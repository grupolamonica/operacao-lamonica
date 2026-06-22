/**
 * API de integração: dados completos de um motorista por CPF (read-only).
 *
 * Consolida, num único envelope tratado, tudo que a Torre conhece do motorista
 * cruzando as três bases:
 *   - Torre   → identidade, conformidade (Angellira), viagens, veículos e
 *               localização (reusa getDriverDossie). Documentos são montados do
 *               cadastro (CNH/Angellira/ANTT/Seguro — a tabela driver_documents
 *               está vazia) e ocorrências ligam pelas viagens do motorista
 *               (alerts.driver_id quase nunca preenchido).
 *   - Ranking → posição, pontuação, vínculo e status (cruzado por nome
 *               normalizado, mesma lógica do listDrivers).
 *   - Cargas  → candidaturas (cache local cargas_load_candidates ⋈
 *               cargas_open_loads) + cadastro Cargas (motoristas_historico), por CPF.
 *
 * Pensado para consumo server-to-server por outros sistemas (ver
 * integrations.plugin.ts — gate por x-api-key). Resposta cacheada 60s no Redis.
 */

import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { redis } from '../../redis/client'
import { logger } from '../../lib/logger'
import { getDriverDossie } from '../drivers/drivers.service'
import { getRankingDrivers } from '../ranking/ranking.service'
import { getCargasSupabase } from '../cargas/cargas.supabase'
import { normalizeMotorista } from '../positions/viagens.parser'

const CACHE_TTL = 60 // segundos
const cacheKey = (cpf: string) => `integrations:driver:${cpf}`

// Pares from/to do translate() p/ strip de acentos no Postgres (mesma normalização do dossiê).
const ACC = "'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç','AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'"

export interface RankingInfo {
  encontrado: boolean
  posicao: number | null
  pontuacao: number | null
  vinculo: string | null
  status: string | null
}

/** Normaliza um CPF para 11 dígitos. Retorna null se não tiver 11 dígitos. */
export function normalizeCpf(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  return digits.length === 11 ? digits : null
}

/** Sinal de ranking por nome normalizado (o `nome` do ranking traz " (id)" no fim — strip antes). */
async function rankingByName(name: string | null): Promise<RankingInfo> {
  const vazio: RankingInfo = { encontrado: false, posicao: null, pontuacao: null, vinculo: null, status: null }
  if (!name) return vazio
  try {
    const ranked = await getRankingDrivers()
    const alvo = normalizeMotorista(name)
    const hit = ranked.find((r) => normalizeMotorista(r.nome.replace(/\s*\(\d+\)\s*$/, '')) === alvo)
    if (!hit) return vazio
    return {
      encontrado: true,
      posicao: hit.rank ?? null,
      pontuacao: hit.pontuacao != null ? Math.round(hit.pontuacao * 100) / 100 : null,
      vinculo: hit.vinculo ?? null,
      status: hit.status ?? null,
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'integrations: ranking indisponível')
    return vazio
  }
}

/** Candidaturas a cargas do motorista — cache local (cargas_load_candidates ⋈ cargas_open_loads) por CPF. */
async function cargasByCpf(cpf: string) {
  const rows = (await db.execute(sql`
    SELECT c.id, c.load_id, c.origin AS tipo_registro, c.status, c.queue_position,
           c.vehicle_type, c.horse_plate, c.trailer_plate, c.driver_nome, c.created_at,
           l.lh, l.cliente, l.origem, l.destino, l.perfil, l.valor, l.bonus, l.distancia_km
    FROM cargas_load_candidates c
    LEFT JOIN cargas_open_loads l ON l.id = c.load_id
    WHERE regexp_replace(coalesce(c.driver_cpf, ''), '[^0-9]', '', 'g') = ${cpf}
    ORDER BY c.created_at DESC NULLS LAST
  `)) as unknown as any[]

  return rows.map((r) => ({
    candidaturaId: r.id,
    loadId: r.load_id,
    tipoRegistro: r.tipo_registro,         // 'lead' | 'claim'
    status: r.status,
    posicaoFila: r.queue_position ?? null,
    veiculoTipo: r.vehicle_type ?? null,
    cavalo: r.horse_plate ?? null,
    carreta: r.trailer_plate ?? null,
    criadoEm: r.created_at ?? null,
    carga: (r.lh || r.cliente || r.origem || r.destino)
      ? {
          lh: r.lh ?? null,
          cliente: r.cliente ?? null,
          origem: r.origem ?? null,
          destino: r.destino ?? null,
          perfil: r.perfil ?? null,
          valor: r.valor != null ? Number(r.valor) : null,
          bonus: r.bonus != null ? Number(r.bonus) : null,
          distanciaKm: r.distancia_km != null ? Number(r.distancia_km) : null,
        }
      : null,
    _driverNome: (r.driver_nome ?? null) as string | null,
  }))
}

export interface DriverByCpfResult {
  status: number
  body: unknown
}

type Dossie = NonNullable<Awaited<ReturnType<typeof getDriverDossie>>>

/**
 * Trata o bloco `viagens` do dossiê para a resposta da integração:
 *
 *  - Remove `rankingScore` de cada viagem recente: a coluna `trips.ranking_score`
 *    (jsonb) nunca é populada (0/20406 viagens) e o código original ainda fazia
 *    `typeof x === 'number'` sobre um jsonb — saía sempre null. O ranking real do
 *    motorista está no bloco `ranking` (top-level), não por viagem.
 *
 *  - Preenche cavalo/carreta: `trips.sheet_cavalo/sheet_carreta` só existem em
 *    viagens vindas do Cargas; nas de painel/SPX ficam null. Quando ausentes,
 *    cai no cadastro de veículos do motorista (vehicles.plate_role HORSE→cavalo,
 *    TRAILER_*→carreta). `placasFonte` indica a procedência ('viagem' | 'cadastro').
 *    Com 2+ placas do mesmo papel, escolhe a VÁLIDA (Angellira FOUND, depois maior
 *    validade) — não a 1ª alfabética, que pode ser a placa vencida/desativada.
 */
function melhorPlaca(veiculos: Dossie['veiculos'], papel: 'HORSE' | 'TRAILER'): string | null {
  const cands = veiculos.filter((v) =>
    papel === 'HORSE'
      ? String(v.plateRole ?? '').toUpperCase() === 'HORSE'
      : String(v.plateRole ?? '').toUpperCase().startsWith('TRAILER'),
  )
  if (cands.length === 0) return null
  const ts = (s: string | null | undefined) => (s ? Date.parse(s) || 0 : 0)
  const conforme = (s: string | null | undefined) => (/FOUND|CONFORME/i.test(String(s ?? '')) ? 1 : 0)
  const ord = [...cands].sort((a, b) => {
    const af = conforme(a.angelliraStatus), bf = conforme(b.angelliraStatus)
    if (af !== bf) return bf - af                              // Angellira conforme primeiro
    return ts(b.angelliraValidUntil) - ts(a.angelliraValidUntil) // depois maior validade
  })
  return ord[0]?.plate ?? null
}

function tratarViagens(dossie: Dossie) {
  const veiculos = dossie.veiculos ?? []
  const cavaloCadastro = melhorPlaca(veiculos, 'HORSE')
  const carretaCadastro = melhorPlaca(veiculos, 'TRAILER')

  const recentes = (dossie.viagens?.recentes ?? []).map((r) => {
    const cavalo = r.cavalo ?? cavaloCadastro
    const carreta = r.carreta ?? carretaCadastro
    return {
      code: r.code,
      origin: r.origin,
      destination: r.destination,
      status: r.status,
      slaStatus: r.slaStatus,
      windowStart: r.windowStart,
      eta: r.eta,
      valor: r.valor,
      sheetLh: r.sheetLh,
      cavalo,
      carreta,
      placasFonte: (r.cavalo || r.carreta) ? 'viagem' : ((cavalo || carreta) ? 'cadastro' : null),
    }
  })

  return { ...dossie.viagens, recentes }
}

/**
 * Situação de um documento pela data de validade, em dias de CALENDÁRIO
 * (não timestamp — evita off-by-one: vence hoje = 'vence_em_30d', não 'vencido').
 * Aceita 'YYYY-MM-DD' ou ISO com hora.
 */
function vencStatus(validade: string | null | undefined): string | null {
  if (!validade) return null
  const [y, m, d] = String(validade).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const alvo = new Date(y, m - 1, d)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000)
  if (dias < 0) return 'vencido'
  if (dias <= 30) return 'vence_em_30d'
  return 'vigente'
}

/** Mapeia o status cru da Angellira p/ o vocabulário dos documentos (quando não há validade). */
function normalizaAngellira(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return null
  if (s.startsWith('conforme') || s === 'found') return 'vigente'
  if (s.startsWith('vencido') || s.includes('expirad')) return 'vencido'
  if (s.includes('conforme') /* "não conforme" */ || s === 'not_found') return 'invalido'
  return 'desconhecido' // strings truncadas/lixo do cadastro
}

/**
 * Documentos do motorista. A tabela `driver_documents` está vazia no banco
 * (0 linhas — nunca populada), então o dossiê retornava []. Os documentos reais
 * vivem no cadastro (`drivers`): monta CNH + Angellira a partir de
 * identidade/conformidade. (ANTT/Seguro ficam só em `conformidade` como flags.)
 *
 * `status` usa SEMPRE o mesmo vocabulário (vigente|vence_em_30d|vencido|
 * invalido|desconhecido), derivado da validade quando há; `statusOrigem` guarda
 * o texto cru do cadastro (o da Angellira pode vir sujo/truncado).
 */
interface DocItem { tipo: string; numero: string | null; categoria: string | null; status: string | null; statusOrigem: string | null; validade: string | null }

function montarDocumentos(identidade: Dossie['identidade'], conformidade: Dossie['conformidade']): DocItem[] {
  const docs: DocItem[] = []
  if (identidade.cnh || identidade.cnhValidade) {
    docs.push({ tipo: 'CNH', numero: identidade.cnh ?? null, categoria: identidade.cnhCategoria ?? null, status: vencStatus(identidade.cnhValidade), statusOrigem: null, validade: identidade.cnhValidade ?? null })
  }
  if (conformidade?.angelliraStatus || conformidade?.angelliraValidUntil) {
    docs.push({
      tipo: 'Angellira', numero: null, categoria: null,
      status: vencStatus(conformidade.angelliraValidUntil) ?? normalizaAngellira(conformidade.angelliraStatus),
      statusOrigem: conformidade.angelliraStatus ?? null,
      validade: conformidade.angelliraValidUntil ?? null,
    })
  }
  return docs
}

/**
 * Ocorrências (alerts) do motorista. `alerts.driver_id` quase nunca é preenchido
 * (61 de 46041 linhas) — os alertas ligam por `trip_id`. O dossiê filtrava só por
 * driver_id, retornando []. Aqui liga pelas VIAGENS do motorista (driver_id OR
 * shopee_driver_id OR nome normalizado), além do driver_id direto.
 */
const OCORRENCIAS_LIMIT = 30

async function ocorrenciasDoMotorista(id: string, shopee: string | null, name: string) {
  // O ramo por nome só casa viagens AINDA NÃO vinculadas a outro motorista
  // (driver_id NULL ou = este) — blinda contra homônimo cujas viagens foram
  // atribuídas a outrem. count(*) OVER() traz o total antes do LIMIT.
  const rows = (await db.execute(sql`
    WITH dt AS (
      SELECT id FROM trips
      WHERE driver_id = ${id}
         OR (${shopee}::text IS NOT NULL AND shopee_driver_id = ${shopee})
         OR ((driver_id IS NULL OR driver_id = ${id})
             AND nullif(upper(translate(trim(sheet_motorista), ${sql.raw(ACC)})), '') = upper(translate(trim(${name}), ${sql.raw(ACC)})))
    )
    SELECT type, severity, status, title, occurred_at, resolved_at, count(*) OVER()::int AS total
    FROM alerts
    WHERE driver_id = ${id} OR trip_id IN (SELECT id FROM dt)
    ORDER BY occurred_at DESC
    LIMIT ${OCORRENCIAS_LIMIT}
  `)) as unknown as any[]
  const total = rows[0]?.total ?? 0
  return {
    total,
    truncado: total > OCORRENCIAS_LIMIT,
    itens: rows.map((a) => ({
      type: a.type, severity: a.severity, status: a.status, title: a.title,
      occurredAt: a.occurred_at, resolvedAt: a.resolved_at ?? null,
    })),
  }
}

interface CadastroCargas {
  nome: string | null; driverKind: string | null; cnh: string | null; cnhValidade: string | null
  cnhCategoria: string | null; rg: string | null; telefone: string | null; nascimento: string | null
  cidade: string | null; estado: string | null; angelliraEnvio: string | null
  angelliraValidade: string | null; aspxEncontrado: boolean | null
}

/** Busca a linha do motorista no Cargas (motoristas_historico, por CPF) — inclui o raw_json da consulta Angellira. */
async function fetchCargasMotorista(cpf: string): Promise<Record<string, unknown> | null> {
  try {
    const sb = getCargasSupabase()
    const { data } = await sb
      .from('motoristas_historico')
      .select('cpf, nome, driver_kind, cnh, cnh_validade, cnh_categoria, rg, telefone, nascimento, cidade, estado, angellira_query_id, angellira_sent_date, angellira_limit_date, aspx_found, raw_json')
      .eq('cpf', cpf)
      .limit(1)
    return (data?.[0] as Record<string, unknown>) ?? null
  } catch {
    return null
  }
}

/** Mapeia a linha do Cargas p/ o cadastro camelCase. */
function mapCadastro(r: Record<string, unknown> | null): CadastroCargas | null {
  if (!r) return null
  return {
    nome: (r.nome as string) ?? null, driverKind: (r.driver_kind as string) ?? null,
    cnh: (r.cnh as string) ?? null, cnhValidade: (r.cnh_validade as string) ?? null,
    cnhCategoria: (r.cnh_categoria as string) ?? null, rg: (r.rg as string) ?? null,
    telefone: (r.telefone as string) ?? null, nascimento: (r.nascimento as string) ?? null,
    cidade: (r.cidade as string) ?? null, estado: (r.estado as string) ?? null,
    angelliraEnvio: (r.angellira_sent_date as string) ?? null,
    angelliraValidade: (r.angellira_limit_date as string) ?? null,
    aspxEncontrado: (r.aspx_found as boolean) ?? null,
  }
}

export interface ConsultaAngellira {
  consultaId: number | null
  status: string | null
  conforme: boolean
  /** true quando a última consulta salva NÃO é conforme (e não há conforme anterior no nosso banco). */
  semConsultaConforme: boolean
  consultadoEm: string | null
  validoAte: string | null
  documentos: Array<Record<string, unknown>>
  /** arquivos anexados (biometria/certificado/retificações) — só populados pela API Angellira; hoje vazio. */
  anexos: Array<Record<string, unknown>>
}

const trimOrNull = (v: unknown): string | null => { const s = v == null ? '' : String(v).trim(); return s || null }

/**
 * Documentos da ÚLTIMA consulta CONFORME do Angellira (motoristas_historico.raw_json).
 * Guardamos só a última consulta por CPF; se ela não for conforme, retorna
 * semConsultaConforme:true e documentos vazio (uma conforme anterior só viria da API Angellira).
 * Os arquivos em si (biometria/certificado) ficam em `anexos` quando o raw_json os trouxer
 * (hoje sempre vazios no nosso banco — vivem na plataforma Angellira).
 */
function mapConsultaAngellira(r: Record<string, unknown> | null): ConsultaAngellira | null {
  const rj = r?.raw_json as Record<string, any> | undefined
  if (!rj) return null
  const statusDesc = (rj.status?.description ?? rj.description ?? null) as string | null
  const conforme = /^conforme/i.test(String(statusDesc ?? ''))
  const base: ConsultaAngellira = {
    consultaId: (rj.id as number) ?? (r?.angellira_query_id as number) ?? null,
    status: statusDesc,
    conforme,
    semConsultaConforme: !conforme,
    consultadoEm: trimOrNull(rj.sentDate) ?? trimOrNull(r?.angellira_sent_date),
    validoAte: trimOrNull(rj.limitDate) ?? trimOrNull(r?.angellira_limit_date),
    documentos: [],
    anexos: [],
  }
  if (!conforme) return base // "sempre a última conforme" — não expõe documentos de consulta não-conforme

  const h = (rj.history ?? {}) as Record<string, any>
  const docs: Array<Record<string, unknown>> = []
  if (trimOrNull(h.driverCNH) || trimOrNull(h.driverCNHValidity)) {
    docs.push({ tipo: 'CNH', numero: trimOrNull(h.driverCNH), categoria: trimOrNull(h.driverCNHCategory),
      validade: h.driverCNHValidityUTC ?? trimOrNull(h.driverCNHValidity), seguranca: trimOrNull(h.driverCNHSecurity),
      estado: trimOrNull(h.driverCNHState) })
  }
  if (trimOrNull(h.driverRg)) {
    docs.push({ tipo: 'RG', numero: trimOrNull(h.driverRg), orgao: trimOrNull(h.driverRgOrgan), estado: trimOrNull(h.driverRgState) })
  }
  const veiculo = (pref: string, papel: string) => {
    const placa = trimOrNull(h[`${pref}Plate`])
    if (!placa && !trimOrNull(h[`${pref}Chassis`])) return
    docs.push({ tipo: 'Veículo', papel, placa, antt: trimOrNull(h[`${pref}Antt`]), chassi: trimOrNull(h[`${pref}Chassis`]),
      renavam: trimOrNull(h[`${pref}Renavam`]), marca: trimOrNull(h[`${pref}Brand`]), modelo: trimOrNull(h[`${pref}Model`]),
      cor: trimOrNull(h[`${pref}Color`]), anoModelo: h[`${pref}ModelYear`] ?? null, anoFabricacao: h[`${pref}FabricationYear`] ?? null,
      licenciamento: trimOrNull(h[`${pref}LastLicensing`]), uf: trimOrNull(h[`${pref}UF`]) })
  }
  veiculo('cab', 'cavalo'); veiculo('tow', 'carreta'); veiculo('tow2', 'carreta'); veiculo('tow3', 'carreta')
  base.documentos = docs

  const anexos: Array<Record<string, unknown>> = []
  if (trimOrNull(rj.biometricsUrl)) anexos.push({ tipo: 'biometria', url: trimOrNull(rj.biometricsUrl) })
  if (trimOrNull(rj.observationCertificate)) anexos.push({ tipo: 'certificado', valor: trimOrNull(rj.observationCertificate) })
  if (Array.isArray(rj.rectifications)) for (const ret of rj.rectifications) anexos.push({ tipo: 'retificacao', ...(ret as object) })
  base.anexos = anexos
  return base
}

/**
 * Localização do motorista. O match de posição do getDriverDossie compara o nome
 * SEM strip de acento, mas driver_positions é acento-stripped → motoristas com
 * acento no nome vinham com ultimaPosicao null apesar de GPS vivo. Aqui, se o
 * dossiê não achou posição, re-tenta com normalização de acento (translate).
 */
async function resolverLocalizacao(dossieLoc: Dossie['localizacao'], name: string) {
  if (dossieLoc?.ultimaPosicao) return dossieLoc
  const [pos] = (await db.execute(sql`
    SELECT data_posicao, cidade, uf, veiculo, lat, lng
    FROM driver_positions
    WHERE upper(translate(trim(motorista_norm), ${sql.raw(ACC)})) = upper(translate(trim(${name}), ${sql.raw(ACC)}))
       OR upper(translate(trim(motorista), ${sql.raw(ACC)})) = upper(translate(trim(${name}), ${sql.raw(ACC)}))
    ORDER BY data_posicao DESC
    LIMIT 1
  `)) as unknown as any[]
  if (!pos) return dossieLoc
  return {
    address: dossieLoc?.address ?? null,
    lat: dossieLoc?.lat ?? (pos.lat != null ? Number(pos.lat) : null),
    lng: dossieLoc?.lng ?? (pos.lng != null ? Number(pos.lng) : null),
    ultimaPosicao: { at: pos.data_posicao ?? null, cidade: pos.cidade ?? null, uf: pos.uf ?? null, veiculo: pos.veiculo ?? null },
  }
}

/**
 * Dossiê completo do motorista por CPF (ranking + torre + cargas), já tratado.
 *
 * 400 → CPF inválido | 404 → nenhum vestígio do CPF nas bases | 200 → envelope.
 * Quando o CPF existe no Cargas/Ranking mas NÃO há cadastro na Torre, retorna
 * o que houver em modo best-effort (cadastroTorre:false, fonte:'cargas').
 */
export async function getDriverFullByCpf(rawCpf: string): Promise<DriverByCpfResult> {
  const cpf = normalizeCpf(rawCpf)
  if (!cpf) return { status: 400, body: { error: 'CPF inválido (esperado 11 dígitos)' } }

  try {
    const cached = await redis.get(cacheKey(cpf))
    if (cached) return { status: 200, body: JSON.parse(cached) }
  } catch { /* cache miss/indisponível — segue para o cálculo */ }

  // 1) Motorista na Torre por CPF (match por dígitos — a coluna pode vir formatada).
  const [drow] = (await db.execute(sql`
    SELECT id, name FROM drivers
    WHERE regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = ${cpf}
    LIMIT 1
  `)) as unknown as Array<{ id: string; name: string }>

  let body: Record<string, unknown>

  if (drow) {
    const [dossie, ranking, cargas, cargasMot] = await Promise.all([
      getDriverDossie(drow.id),
      rankingByName(drow.name),
      cargasByCpf(cpf),
      fetchCargasMotorista(cpf),
    ])
    const cadCargas = mapCadastro(cargasMot)
    const consultaAngellira = mapConsultaAngellira(cargasMot)

    if (dossie) {
      // ocorrências (por viagens) e localização (re-match c/ acento) dependem do
      // dossiê resolvido — rodam em paralelo após o Promise.all acima.
      const [ocorrencias, localizacao] = await Promise.all([
        ocorrenciasDoMotorista(drow.id, dossie.identidade.shopeeDriverId ?? null, drow.name),
        resolverLocalizacao(dossie.localizacao, drow.name),
      ])
      body = {
        cpf,
        cadastroTorre: true,
        fonte: 'torre',
        geradoEm: new Date().toISOString(),
        identidade: dossie.identidade,
        conformidade: dossie.conformidade,
        ranking,
        viagens: tratarViagens(dossie),
        veiculos: dossie.veiculos,
        documentos: montarDocumentos(dossie.identidade, dossie.conformidade),
        consultaAngellira,
        localizacao,
        ocorrencias,
        cargas: { total: cargas.length, candidaturas: cargas.map(stripInternal), cadastroCargas: cadCargas },
      }
      await cache(cpf, body)
      return { status: 200, body }
    }
    // dossiê sumiu entre o lookup e o fetch (raro) — cai no best-effort abaixo.
  }

  // 2) Best-effort: CPF sem cadastro na Torre — monta do Cargas + Ranking.
  const [cargas, cargasMot] = await Promise.all([cargasByCpf(cpf), fetchCargasMotorista(cpf)])
  const cadCargas = mapCadastro(cargasMot)
  const consultaAngellira = mapConsultaAngellira(cargasMot)
  const nome = cargas.find((c) => c._driverNome)?._driverNome ?? cadCargas?.nome ?? null
  const ranking = await rankingByName(nome)

  if (!nome && !ranking.encontrado && cargas.length === 0 && !cadCargas) {
    return { status: 404, body: { error: 'Motorista não encontrado para o CPF informado' } }
  }

  body = {
    cpf,
    cadastroTorre: false,
    fonte: 'cargas',
    geradoEm: new Date().toISOString(),
    identidade: {
      id: null, code: null, name: nome, cpf,
      rg: cadCargas?.rg ?? null,
      cnh: cadCargas?.cnh ?? null,
      cnhCategoria: cadCargas?.cnhCategoria ?? null,
      cnhValidade: cadCargas?.cnhValidade ?? null,
      nascimento: cadCargas?.nascimento ?? null,
      driverKind: cadCargas?.driverKind ?? ranking.vinculo ?? null,
      cidade: cadCargas?.cidade ?? null,
      estado: cadCargas?.estado ?? null,
      phone: cadCargas?.telefone ?? null,
      email: null, shopeeDriverId: null,
    },
    conformidade: null,
    ranking,
    viagens: null,
    veiculos: [],
    documentos: [],
    consultaAngellira,
    localizacao: null,
    ocorrencias: { total: 0, truncado: false, itens: [] },
    cargas: { total: cargas.length, candidaturas: cargas.map(stripInternal), cadastroCargas: cadCargas },
  }
  await cache(cpf, body)
  return { status: 200, body }
}

/** Remove campos internos (prefixo _) antes de serializar a candidatura. */
function stripInternal<T extends { _driverNome?: unknown }>(c: T) {
  const { _driverNome, ...rest } = c
  return rest
}

async function cache(cpf: string, body: unknown): Promise<void> {
  try { await redis.set(cacheKey(cpf), JSON.stringify(body), 'EX', CACHE_TTL) } catch { /* noop */ }
}
