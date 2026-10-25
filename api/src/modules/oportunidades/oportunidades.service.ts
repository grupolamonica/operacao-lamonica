import { and, desc, eq, gte, ilike, lte, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  oportunidadesCarga,
  type FonteOportunidade,
  type ModalidadeOportunidade,
  type StatusOportunidade,
} from '../../db/schema'
import { logger } from '../../lib/logger'
import { calcularMargem, MARGEM_VERSAO, type MemoriaCalculo } from './margem.service'

/**
 * Oportunidades de Carga — CRUD (DC-560).
 *
 * A margem é recalculada e GRAVADA a cada escrita que possa mudá-la (criação e
 * qualquer alteração de rota, frete, veículo, modalidade ou distância manual). Guardar
 * o resultado — e não só calcular na leitura — é o que permite comparar a oportunidade
 * de hoje com a de agosto depois que a base de custo mudar: a memória de cálculo fica
 * congelada junto do número que ela explica.
 */

export interface NovaOportunidade {
  origem: string
  destino: string
  cliente?: string | null
  valorFrete: number
  dataCarregamento?: string | null
  tipoVeiculo: string
  fonte: FonteOportunidade
  fonteReferencia?: string | null
  modalidade?: ModalidadeOportunidade
  distanciaKmManual?: number | null
  observacoes?: string | null
  criadoPor: string | null
  criadoPorNome: string | null
}

export interface AlteracaoOportunidade {
  origem?: string
  destino?: string
  cliente?: string | null
  valorFrete?: number
  dataCarregamento?: string | null
  tipoVeiculo?: string
  fonte?: FonteOportunidade
  fonteReferencia?: string | null
  modalidade?: ModalidadeOportunidade
  distanciaKmManual?: number | null
  status?: StatusOportunidade
  motivoDescarte?: string | null
  observacoes?: string | null
}

export interface FiltroOportunidades {
  status?: StatusOportunidade | null
  cliente?: string | null
  fonte?: FonteOportunidade | null
  inicio?: string | null
  fim?: string | null
  limite?: number
}

/** Campos cuja mudança invalida a margem gravada. */
const CAMPOS_QUE_MUDAM_MARGEM = [
  'origem',
  'destino',
  'valorFrete',
  'tipoVeiculo',
  'modalidade',
  'distanciaKmManual',
] as const

function numeroOuNull(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

/** Converte a linha do banco (numeric vem como string no pg) para o shape da tela. */
function serializar(linha: typeof oportunidadesCarga.$inferSelect) {
  return {
    id: linha.id,
    origem: linha.origem,
    destino: linha.destino,
    cliente: linha.cliente,
    valor_frete: numeroOuNull(linha.valorFrete),
    data_carregamento: linha.dataCarregamento,
    tipo_veiculo: linha.tipoVeiculo,
    fonte: linha.fonte as FonteOportunidade,
    fonte_referencia: linha.fonteReferencia,
    status: linha.status as StatusOportunidade,
    motivo_descarte: linha.motivoDescarte,
    modalidade: linha.modalidade as ModalidadeOportunidade,
    distancia_km_manual: numeroOuNull(linha.distanciaKmManual),
    margem_valor: numeroOuNull(linha.margemValor),
    margem_percentual: numeroOuNull(linha.margemPercentual),
    margem_memoria: (linha.margemMemoria as MemoriaCalculo | null) ?? null,
    margem_versao: linha.margemVersao,
    margem_calculada_em: linha.margemCalculadaEm,
    observacoes: linha.observacoes,
    criado_por_nome: linha.criadoPorNome,
    criado_em: linha.criadoEm,
    atualizado_em: linha.atualizadoEm,
  }
}

export type OportunidadeSerializada = ReturnType<typeof serializar>

/**
 * Calcula a margem e devolve os campos a gravar. Nunca lança: falha de cálculo vira
 * margem nula com o motivo na memória — a oportunidade continua registrada. Perder o
 * registro da oferta porque o custo/km não estava cadastrado seria o pior desfecho.
 */
async function camposDeMargem(entrada: {
  origem: string
  destino: string
  tipoVeiculo: string
  modalidade: ModalidadeOportunidade
  valorFrete: number
  distanciaKmManual?: number | null
}) {
  let memoria: MemoriaCalculo
  try {
    memoria = await calcularMargem({
      origem: entrada.origem,
      destino: entrada.destino,
      tipoVeiculo: entrada.tipoVeiculo,
      modalidade: entrada.modalidade,
      frete: entrada.valorFrete,
      distanciaKmManual: entrada.distanciaKmManual ?? null,
    })
  } catch (err) {
    logger.error({ err }, '[oportunidades] falha ao calcular margem — grava sem margem')
    return {
      margemValor: null,
      margemPercentual: null,
      margemMemoria: {
        versao: MARGEM_VERSAO,
        calculavel: false,
        motivo: 'Falha ao consultar a base de custo/distância. Tente recalcular.',
      },
      margemVersao: MARGEM_VERSAO,
      margemCalculadaEm: new Date(),
    }
  }

  return {
    margemValor: memoria.margem_valor === null ? null : String(memoria.margem_valor),
    margemPercentual: memoria.margem_percentual === null ? null : String(memoria.margem_percentual),
    margemMemoria: memoria,
    margemVersao: memoria.versao,
    margemCalculadaEm: new Date(),
  }
}

export async function listarOportunidades(filtro: FiltroOportunidades = {}) {
  const condicoes = []
  if (filtro.status) condicoes.push(eq(oportunidadesCarga.status, filtro.status))
  if (filtro.fonte) condicoes.push(eq(oportunidadesCarga.fonte, filtro.fonte))
  if (filtro.cliente) condicoes.push(ilike(oportunidadesCarga.cliente, `%${filtro.cliente}%`))
  // Período é sobre a data de CARREGAMENTO (é o que a operação pergunta: "o que tem
  // para semana que vem"), não sobre a data de cadastro.
  if (filtro.inicio) condicoes.push(gte(oportunidadesCarga.dataCarregamento, filtro.inicio))
  if (filtro.fim) condicoes.push(lte(oportunidadesCarga.dataCarregamento, filtro.fim))

  const limite = Math.min(Math.max(filtro.limite ?? 200, 1), 500)

  const linhas = await db
    .select()
    .from(oportunidadesCarga)
    .where(condicoes.length ? and(...condicoes) : undefined)
    .orderBy(desc(oportunidadesCarga.criadoEm))
    .limit(limite)

  return linhas.map(serializar)
}

export async function obterOportunidade(id: string): Promise<OportunidadeSerializada | null> {
  const linhas = await db
    .select()
    .from(oportunidadesCarga)
    .where(eq(oportunidadesCarga.id, id))
    .limit(1)
  const linha = linhas[0]
  return linha ? serializar(linha) : null
}

export async function criarOportunidade(dados: NovaOportunidade): Promise<OportunidadeSerializada> {
  const modalidade = dados.modalidade ?? 'terceiro'
  const margem = await camposDeMargem({
    origem: dados.origem,
    destino: dados.destino,
    tipoVeiculo: dados.tipoVeiculo,
    modalidade,
    valorFrete: dados.valorFrete,
    distanciaKmManual: dados.distanciaKmManual,
  })

  const linhas = await db
    .insert(oportunidadesCarga)
    .values({
      origem: dados.origem.trim(),
      destino: dados.destino.trim(),
      cliente: dados.cliente?.trim() || null,
      valorFrete: String(dados.valorFrete),
      dataCarregamento: dados.dataCarregamento || null,
      tipoVeiculo: dados.tipoVeiculo.trim(),
      fonte: dados.fonte,
      fonteReferencia: dados.fonteReferencia?.trim() || null,
      modalidade,
      distanciaKmManual:
        dados.distanciaKmManual === null || dados.distanciaKmManual === undefined
          ? null
          : String(dados.distanciaKmManual),
      observacoes: dados.observacoes?.trim() || null,
      criadoPor: dados.criadoPor,
      criadoPorNome: dados.criadoPorNome,
      ...margem,
    })
    .returning()

  return serializar(linhas[0]!)
}

export async function atualizarOportunidade(
  id: string,
  alteracao: AlteracaoOportunidade,
): Promise<OportunidadeSerializada | null> {
  const atual = await db
    .select()
    .from(oportunidadesCarga)
    .where(eq(oportunidadesCarga.id, id))
    .limit(1)
  const linhaAtual = atual[0]
  if (!linhaAtual) return null

  const patch: Record<string, unknown> = { atualizadoEm: new Date() }

  if (alteracao.origem !== undefined) patch.origem = alteracao.origem.trim()
  if (alteracao.destino !== undefined) patch.destino = alteracao.destino.trim()
  if (alteracao.cliente !== undefined) patch.cliente = alteracao.cliente?.trim() || null
  if (alteracao.valorFrete !== undefined) patch.valorFrete = String(alteracao.valorFrete)
  if (alteracao.dataCarregamento !== undefined) patch.dataCarregamento = alteracao.dataCarregamento || null
  if (alteracao.tipoVeiculo !== undefined) patch.tipoVeiculo = alteracao.tipoVeiculo.trim()
  if (alteracao.fonte !== undefined) patch.fonte = alteracao.fonte
  if (alteracao.fonteReferencia !== undefined) patch.fonteReferencia = alteracao.fonteReferencia?.trim() || null
  if (alteracao.modalidade !== undefined) patch.modalidade = alteracao.modalidade
  if (alteracao.observacoes !== undefined) patch.observacoes = alteracao.observacoes?.trim() || null
  if (alteracao.status !== undefined) patch.status = alteracao.status
  if (alteracao.motivoDescarte !== undefined) patch.motivoDescarte = alteracao.motivoDescarte?.trim() || null
  if (alteracao.distanciaKmManual !== undefined) {
    patch.distanciaKmManual =
      alteracao.distanciaKmManual === null ? null : String(alteracao.distanciaKmManual)
  }

  // Recalcula só quando um insumo da margem mudou de verdade. Mudança de status ou de
  // observação não deve reescrever a memória de cálculo daquele momento.
  const mexeuNaMargem = CAMPOS_QUE_MUDAM_MARGEM.some(
    (campo) => alteracao[campo as keyof AlteracaoOportunidade] !== undefined,
  )

  if (mexeuNaMargem) {
    const margem = await camposDeMargem({
      origem: alteracao.origem ?? linhaAtual.origem,
      destino: alteracao.destino ?? linhaAtual.destino,
      tipoVeiculo: alteracao.tipoVeiculo ?? linhaAtual.tipoVeiculo,
      modalidade: (alteracao.modalidade ?? linhaAtual.modalidade) as ModalidadeOportunidade,
      valorFrete: alteracao.valorFrete ?? Number(linhaAtual.valorFrete),
      distanciaKmManual:
        alteracao.distanciaKmManual !== undefined
          ? alteracao.distanciaKmManual
          : numeroOuNull(linhaAtual.distanciaKmManual),
    })
    Object.assign(patch, margem)
  }

  const linhas = await db
    .update(oportunidadesCarga)
    .set(patch)
    .where(eq(oportunidadesCarga.id, id))
    .returning()

  return linhas[0] ? serializar(linhas[0]) : null
}

/** Recálculo explícito — usado depois de cadastrar/corrigir o custo/km de referência. */
export async function recalcularMargemOportunidade(
  id: string,
): Promise<OportunidadeSerializada | null> {
  const atual = await db
    .select()
    .from(oportunidadesCarga)
    .where(eq(oportunidadesCarga.id, id))
    .limit(1)
  const linha = atual[0]
  if (!linha) return null

  const margem = await camposDeMargem({
    origem: linha.origem,
    destino: linha.destino,
    tipoVeiculo: linha.tipoVeiculo,
    modalidade: linha.modalidade as ModalidadeOportunidade,
    valorFrete: Number(linha.valorFrete),
    distanciaKmManual: numeroOuNull(linha.distanciaKmManual),
  })

  const linhas = await db
    .update(oportunidadesCarga)
    .set({ ...margem, atualizadoEm: new Date() })
    .where(eq(oportunidadesCarga.id, id))
    .returning()

  return linhas[0] ? serializar(linhas[0]) : null
}

/** Contagem por status — alimenta os cards do topo da tela sem baixar a lista toda. */
export async function resumoPorStatus() {
  const linhas = await db
    .select({
      status: oportunidadesCarga.status,
      total: sql<string>`count(*)::text`,
    })
    .from(oportunidadesCarga)
    .groupBy(oportunidadesCarga.status)

  return linhas.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = Number(l.total)
    return acc
  }, {})
}
