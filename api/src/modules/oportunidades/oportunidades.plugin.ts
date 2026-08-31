import { Elysia, t } from 'elysia'

import { authGuard } from '../../lib/rbac'
import {
  FONTES_OPORTUNIDADE,
  MODALIDADES_OPORTUNIDADE,
  STATUS_OPORTUNIDADE,
  fonteValida,
  modalidadeValida,
  statusValido,
  type FonteOportunidade,
  type ModalidadeOportunidade,
  type StatusOportunidade,
} from '../../db/schema'
import { calcularMargem } from './margem.service'
import {
  atualizarOportunidade,
  criarOportunidade,
  listarOportunidades,
  obterOportunidade,
  recalcularMargemOportunidade,
  resumoPorStatus,
} from './oportunidades.service'

/**
 * Oportunidades de Carga — DC-560 (CRUD) + DC-565 (margem).
 *
 *   GET   /api/oportunidades                      lista com filtros
 *   GET   /api/oportunidades/opcoes               listas fechadas (fonte/status/modalidade)
 *   GET   /api/oportunidades/resumo               contagem por status
 *   GET   /api/oportunidades/:id                  detalhe
 *   POST  /api/oportunidades                      cadastro rápido
 *   PATCH /api/oportunidades/:id                  alteração / mudança de status
 *   POST  /api/oportunidades/:id/recalcular-margem
 *   POST  /api/oportunidades/margem               simula a margem SEM gravar (DC-565)
 *
 * GATE: authGuard direto + checagem de role na própria rota — mesmo motivo do
 * audit.plugin.ts (o onBeforeHandle do requireRole é 'local' e não alcança a rota do
 * consumidor, o que deixaria tudo aberto). O servidor é a fonte da verdade; a tela só
 * esconde no client.
 *
 * O DC-561 pede "padrão da torre (x-api-key, polling)". x-api-key NÃO entra aqui: esta
 * tela é operada por gente logada, não por robô. A ingestão máquina-a-máquina é da
 * Fase 2 (parser IA do DC-562) e vai precisar do seu próprio par de rotas fora do
 * authGuard, como o manifesto faz — e do x-api-key no allowedHeaders do cors().
 */

const PODE_LER = ['admin', 'supervisor', 'analyst', 'viewer'] as const
const PODE_ESCREVER = ['admin', 'supervisor', 'analyst'] as const

type Papel = (typeof PODE_LER)[number] | 'manifesto'

function negar(set: { status?: number | string }, papeis: readonly string[]) {
  set.status = 403
  return { error: `Forbidden: requires role ${papeis.join('|')}` }
}

const podeLer = (role: Papel) => (PODE_LER as readonly string[]).includes(role)
const podeEscrever = (role: Papel) => (PODE_ESCREVER as readonly string[]).includes(role)

const corpoOportunidade = {
  origem: t.String({ minLength: 2, maxLength: 160 }),
  destino: t.String({ minLength: 2, maxLength: 160 }),
  cliente: t.Optional(t.Nullable(t.String({ maxLength: 160 }))),
  valor_frete: t.Number({ exclusiveMinimum: 0 }),
  data_carregamento: t.Optional(t.Nullable(t.String())),
  tipo_veiculo: t.String({ minLength: 1, maxLength: 40 }),
  fonte: t.String(),
  fonte_referencia: t.Optional(t.Nullable(t.String())),
  modalidade: t.Optional(t.String()),
  distancia_km_manual: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
  observacoes: t.Optional(t.Nullable(t.String())),
}

export const oportunidadesPlugin = new Elysia({ name: 'oportunidades' })
  .use(authGuard)

  .get(
    '/api/oportunidades/opcoes',
    ({ user, set }) => {
      if (!podeLer(user.role)) return negar(set, PODE_LER)
      return {
        fontes: FONTES_OPORTUNIDADE,
        status: STATUS_OPORTUNIDADE,
        modalidades: MODALIDADES_OPORTUNIDADE,
      }
    },
    { detail: { tags: ['oportunidades'], summary: 'Listas fechadas para os seletores da tela' } },
  )

  .get(
    '/api/oportunidades/resumo',
    async ({ user, set }) => {
      if (!podeLer(user.role)) return negar(set, PODE_LER)
      return await resumoPorStatus()
    },
    { detail: { tags: ['oportunidades'], summary: 'Contagem de oportunidades por status' } },
  )

  .get(
    '/api/oportunidades',
    async ({ user, query, set }) => {
      if (!podeLer(user.role)) return negar(set, PODE_LER)

      // Filtro inválido é ignorado em vez de derrubar a listagem: a tela é de triagem
      // e vale mais mostrar tudo que devolver erro por um parâmetro de query torto.
      const status = query.status && statusValido(query.status) ? query.status : null
      const fonte = query.fonte && fonteValida(query.fonte) ? query.fonte : null

      return await listarOportunidades({
        status,
        fonte,
        cliente: query.cliente ?? null,
        inicio: query.inicio ?? null,
        fim: query.fim ?? null,
        limite: query.limite ? Number(query.limite) : undefined,
      })
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        fonte: t.Optional(t.String()),
        cliente: t.Optional(t.String()),
        inicio: t.Optional(t.String()),
        fim: t.Optional(t.String()),
        limite: t.Optional(t.String()),
      }),
      detail: { tags: ['oportunidades'], summary: 'Lista oportunidades com filtros' },
    },
  )

  .get(
    '/api/oportunidades/:id',
    async ({ user, params, set }) => {
      if (!podeLer(user.role)) return negar(set, PODE_LER)
      const oportunidade = await obterOportunidade(params.id)
      if (!oportunidade) {
        set.status = 404
        return { error: 'Oportunidade não encontrada.' }
      }
      return oportunidade
    },
    {
      params: t.Object({ id: t.String() }),
      detail: { tags: ['oportunidades'], summary: 'Detalhe da oportunidade' },
    },
  )

  .post(
    '/api/oportunidades',
    async ({ user, body, set }) => {
      if (!podeEscrever(user.role)) return negar(set, PODE_ESCREVER)

      if (!fonteValida(body.fonte)) {
        set.status = 422
        return { error: `Fonte inválida. Use uma de: ${Object.keys(FONTES_OPORTUNIDADE).join(', ')}.` }
      }
      const modalidade = body.modalidade ?? 'terceiro'
      if (!modalidadeValida(modalidade)) {
        set.status = 422
        return {
          error: `Modalidade inválida. Use uma de: ${Object.keys(MODALIDADES_OPORTUNIDADE).join(', ')}.`,
        }
      }

      return await criarOportunidade({
        origem: body.origem,
        destino: body.destino,
        cliente: body.cliente ?? null,
        valorFrete: body.valor_frete,
        dataCarregamento: body.data_carregamento ?? null,
        tipoVeiculo: body.tipo_veiculo,
        fonte: body.fonte as FonteOportunidade,
        fonteReferencia: body.fonte_referencia ?? null,
        modalidade: modalidade as ModalidadeOportunidade,
        distanciaKmManual: body.distancia_km_manual ?? null,
        observacoes: body.observacoes ?? null,
        criadoPor: user.id,
        criadoPorNome: null,
      })
    },
    {
      body: t.Object(corpoOportunidade),
      detail: { tags: ['oportunidades'], summary: 'Cadastra uma oportunidade (margem já calculada)' },
    },
  )

  .patch(
    '/api/oportunidades/:id',
    async ({ user, params, body, set }) => {
      if (!podeEscrever(user.role)) return negar(set, PODE_ESCREVER)

      if (body.fonte !== undefined && !fonteValida(body.fonte)) {
        set.status = 422
        return { error: `Fonte inválida. Use uma de: ${Object.keys(FONTES_OPORTUNIDADE).join(', ')}.` }
      }
      if (body.status !== undefined && !statusValido(body.status)) {
        set.status = 422
        return { error: `Status inválido. Use um de: ${Object.keys(STATUS_OPORTUNIDADE).join(', ')}.` }
      }
      if (body.modalidade !== undefined && !modalidadeValida(body.modalidade)) {
        set.status = 422
        return {
          error: `Modalidade inválida. Use uma de: ${Object.keys(MODALIDADES_OPORTUNIDADE).join(', ')}.`,
        }
      }
      // Descartar sem dizer por quê apaga justamente o dado que o epic quer medir:
      // quanto se recusou e por qual razão.
      if (body.status === 'descartada' && !body.motivo_descarte?.trim()) {
        set.status = 422
        return { error: 'Informe o motivo do descarte.' }
      }

      const atualizada = await atualizarOportunidade(params.id, {
        origem: body.origem,
        destino: body.destino,
        cliente: body.cliente,
        valorFrete: body.valor_frete,
        dataCarregamento: body.data_carregamento,
        tipoVeiculo: body.tipo_veiculo,
        fonte: body.fonte as FonteOportunidade | undefined,
        fonteReferencia: body.fonte_referencia,
        modalidade: body.modalidade as ModalidadeOportunidade | undefined,
        distanciaKmManual: body.distancia_km_manual,
        status: body.status as StatusOportunidade | undefined,
        motivoDescarte: body.motivo_descarte,
        observacoes: body.observacoes,
      })

      if (!atualizada) {
        set.status = 404
        return { error: 'Oportunidade não encontrada.' }
      }
      return atualizada
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        origem: t.Optional(t.String({ minLength: 2, maxLength: 160 })),
        destino: t.Optional(t.String({ minLength: 2, maxLength: 160 })),
        cliente: t.Optional(t.Nullable(t.String({ maxLength: 160 }))),
        valor_frete: t.Optional(t.Number({ exclusiveMinimum: 0 })),
        data_carregamento: t.Optional(t.Nullable(t.String())),
        tipo_veiculo: t.Optional(t.String({ minLength: 1, maxLength: 40 })),
        fonte: t.Optional(t.String()),
        fonte_referencia: t.Optional(t.Nullable(t.String())),
        modalidade: t.Optional(t.String()),
        distancia_km_manual: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
        status: t.Optional(t.String()),
        motivo_descarte: t.Optional(t.Nullable(t.String())),
        observacoes: t.Optional(t.Nullable(t.String())),
      }),
      detail: { tags: ['oportunidades'], summary: 'Altera a oportunidade e recalcula a margem se preciso' },
    },
  )

  .post(
    '/api/oportunidades/:id/recalcular-margem',
    async ({ user, params, set }) => {
      if (!podeEscrever(user.role)) return negar(set, PODE_ESCREVER)
      const atualizada = await recalcularMargemOportunidade(params.id)
      if (!atualizada) {
        set.status = 404
        return { error: 'Oportunidade não encontrada.' }
      }
      return atualizada
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ['oportunidades'],
        summary: 'Recalcula a margem — usar depois de cadastrar ou corrigir o custo/km',
      },
    },
  )

  .post(
    '/api/oportunidades/margem',
    async ({ user, body, set }) => {
      if (!podeLer(user.role)) return negar(set, PODE_LER)

      const modalidade = body.modalidade ?? 'terceiro'
      if (!modalidadeValida(modalidade)) {
        set.status = 422
        return {
          error: `Modalidade inválida. Use uma de: ${Object.keys(MODALIDADES_OPORTUNIDADE).join(', ')}.`,
        }
      }

      return await calcularMargem({
        origem: body.origem,
        destino: body.destino,
        tipoVeiculo: body.tipo_veiculo,
        modalidade: modalidade as ModalidadeOportunidade,
        frete: body.frete,
        distanciaKmManual: body.distancia_km_manual ?? null,
      })
    },
    {
      body: t.Object({
        origem: t.String({ minLength: 2 }),
        destino: t.String({ minLength: 2 }),
        tipo_veiculo: t.String({ minLength: 1 }),
        modalidade: t.Optional(t.String()),
        frete: t.Number({ exclusiveMinimum: 0 }),
        distancia_km_manual: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
      }),
      detail: {
        tags: ['oportunidades'],
        summary: 'Simula a margem sem gravar — contrato do DC-565 (v1 e v2 iguais)',
      },
    },
  )
