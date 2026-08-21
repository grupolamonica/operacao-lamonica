import { Elysia, t } from 'elysia'

import { authGuard } from '../../lib/rbac'
import { logger } from '../../lib/logger'
import { MOTIVOS_ERRO, MOTIVOS_TRATATIVA, ROTULOS_FONE } from '../../db/schema'
import {
  acuraciaSistema,
  motivoErroValido,
  registrarValidacao,
  validacoesPorManifesto,
} from './validacoes.service'
import {
  adicionarFone,
  digitosFone,
  fonesPorMotorista,
  foneValido,
  marcarFone,
  normalizarCodmot,
} from './motorista-fones.service'
import { relatorioTratativas } from './tratativas.report.service'
import {
  agenteDePlantao,
  liberarConferencia,
  pedidosPorManifesto,
  pedirBaixa,
  registrarResultado,
  reivindicarProximo,
} from './baixa.service'
import { applySnapshot, getPendencias } from './manifesto.service'
import {
  chaveManifesto,
  historicoManifesto,
  motivoValido,
  registrarTratativa,
  resumoPorManifesto,
} from './tratativas.service'

/**
 * Manifesto (baixa de manifesto) — Fase F3.
 *
 * O coletor Sascar (desktop, fora do docker) faz POST periódico do snapshot
 * completo de pendências de baixa de manifesto; a Torre guarda em Redis e a
 * tela `/baixa-manifesto` lê com polling. Ver F3-PLANO.md.
 *
 *   POST /api/manifesto/pendencias   (x-api-key — MACHINE-TO-MACHINE, o coletor)
 *   GET  /api/manifesto/pendencias   (cookie JWT — authGuard, a tela)
 *
 * Split em dois sub-plugins no mesmo arquivo — mesmo idioma de push.plugin.ts
 * (publicKeyPlugin vs authedPlugin): a ingestão fica FORA do escopo do
 * authGuard porque quem chama é o coletor, não um usuário logado.
 *
 * NOTA CORS: x-api-key não está em `allowedHeaders` do cors() em index.ts:132-137
 * (só Content-Type/Authorization). Isso é IRRELEVANTE para este endpoint — a
 * chamada é server-to-server (coletor → API), nunca sai de um browser. NÃO
 * chamar a ingestão a partir de um browser/frontend; se algum dia precisar,
 * adicionar x-api-key ao allowedHeaders primeiro.
 */

function checkApiKey(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.MANIFESTO_API_KEY
  if (!expected) {
    return { ok: false, status: 503, error: 'MANIFESTO_API_KEY não configurado no servidor — defina o secret e redeploy' }
  }
  const provided =
    request.headers.get('x-api-key') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    null
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, error: 'x-api-key/Bearer inválido ou ausente' }
  }
  return { ok: true }
}

const ManifestoRefSchema = t.Object({
  codman: t.Number(),
  filial: t.Number(),
})

const TelefoneSchema = t.Object({ rotulo: t.String(), numero: t.String() })

// v1 (fase de observação, 05/08): evidências físicas (cerca do destino + sensor
// de baú com debounce) — objeto. v2 reusa a MESMA chave `evidencias` para outra
// coisa (array de strings, ver EvidenciasV2 abaixo) — por isso a chave no
// PendenciaSchema é uma t.Union dos dois formatos, nunca dois campos.
const EvidenciasV1Schema = t.Object({
  na_cidade_destino: t.Boolean(),
  cerca_desde_local: t.Nullable(t.String()),
  parado: t.Boolean(),
  bau_sensor_presente: t.Nullable(t.Boolean()),
  bau_ativo: t.Boolean(),
  bau_ativo_desde_local: t.Nullable(t.String()),
  bau_ativo_sustentado: t.Boolean(),
  bau_leituras_ativas: t.Number(),
  bau_transicoes_no_destino: t.Number(),
  confirmado_por: t.Array(t.String()),
}, { additionalProperties: true })

// v2: código(s) da(s) evidência(s) que fundamentaram o `estado` calculado
// (ex.: "sm_entrega_realizada", "trava_destravou_destino") — ver V2-CONTRATO.md.
const EvidenciasV2Schema = t.Array(t.String())

// v2: bloco da SM da Angellira (sinal principal do estado) — null quando a
// viagem não tem SM vinculada. additionalProperties: campos podem evoluir
// durante a fase de rodagem (ver V2-CONTRATO.md).
const SmSchema = t.Object({
  // ⚠️ 2ª vez que este padrão causa 422 real em produção (11/08): o coletor
  // manda `null` nestes 4 campos quando a SM não tem o dado (a chave chega,
  // só que com valor null) — `t.Optional` sozinho não aceita null, só chave
  // ausente. Qualquer campo string/number novo aqui que o coletor possa
  // mandar null precisa do mesmo `t.Optional(t.Nullable(...))`.
  codigo: t.Optional(t.Nullable(t.String())),
  status_viagem: t.Optional(t.Nullable(t.String())),
  status_entrega: t.Optional(t.Nullable(t.String())),
  cliente: t.Optional(t.Nullable(t.String())),
  chegada_local: t.Optional(t.Nullable(t.String())),
  saida_local: t.Optional(t.Nullable(t.String())),
  tempo_descarga: t.Optional(t.Nullable(t.String())),
  atraso: t.Optional(t.Nullable(t.String())),
  km_faltante: t.Optional(t.Nullable(t.Number())),
  previsao_chegada_local: t.Optional(t.Nullable(t.String())),
  grade_inicio_local: t.Optional(t.Nullable(t.String())),
  grade_fim_local: t.Optional(t.Nullable(t.String())),
}, { additionalProperties: true })

const TravaBauSchema = t.Object({
  estado: t.Optional(t.String()),
  destravou_no_destino_local: t.Optional(t.Nullable(t.String())),
}, { additionalProperties: true })

const MacroSchema = t.Object({
  ultima: t.Optional(t.String()),
  quando_local: t.Optional(t.Nullable(t.String())),
  digitado: t.Optional(t.Nullable(t.String())),
}, { additionalProperties: true })

// v2 (11/08, furo real): caminhão descarrega e vai embora, mas o manifesto
// continua aberto por morosidade do operador — antes o item voltava pra
// "em trânsito" (saía do radar); agora o coletor mantém o estado com base no
// histórico de permanência no destino. Todos os campos nullable: cada marco só
// existe depois que acontece.
const DestinoHistoricoSchema = t.Object({
  chegou_local: t.Optional(t.Nullable(t.String())),
  saiu_local: t.Optional(t.Nullable(t.String())),
  parado_min_descarga_local: t.Optional(t.Nullable(t.String())),
  macro_fim_no_destino_local: t.Optional(t.Nullable(t.String())),
}, { additionalProperties: true })

/**
 * v1 e v2 coexistem no MESMO endpoint enquanto o coletor_v2.py não substitui o
 * coletor.py em produção (ver V2-CONTRATO.md). Por isso TODOS os campos — dos
 * dois formatos — são t.Optional aqui: um snapshot v1 não traz os campos v2
 * (codman, estado, sm, posicao.km_destino, ...) e um snapshot v2 não traz os
 * campos v1 (codlpr, estagio, manifestos, idPacote, detectada_em, ...). Cada
 * POST chega inteiro em um formato ou outro, nunca misturado dentro do mesmo
 * item — mas o schema precisa aceitar qualquer um dos dois.
 *
 * ⚠️ CRÍTICO: Elysia/TypeBox REMOVE campo não declarado do body — se um campo
 * não estiver aqui, ele nunca chega na tela (mesmo que o coletor o envie).
 */
const PendenciaSchema = t.Object({
  // ── v1 ──────────────────────────────────────────────────────────────────
  codlpr: t.Optional(t.Number()),
  placa: t.Optional(t.String()),
  estagio: t.Optional(t.Union([t.Literal('descarregando'), t.Literal('descarregado')])),
  manifestos: t.Optional(t.Array(ManifestoRefSchema)),
  chegada_gmt: t.Optional(t.Nullable(t.String())),
  chegada_local: t.Optional(t.Nullable(t.String())),
  fim_gmt: t.Optional(t.Nullable(t.String())),
  fim_local: t.Optional(t.Nullable(t.String())),
  idPacote: t.Optional(t.Nullable(t.String())),
  detectada_em: t.Optional(t.String()),
  // Ficha do painel de detalhes (aditivos/opcionais — coletor antigo não envia)
  viagem: t.Optional(t.Nullable(t.Object({
    origem: t.String(),
    saida_local: t.Nullable(t.String()),
    previsao_local: t.Nullable(t.String()),
    carreta: t.String(),
    motorista2: t.String(),
    destino_uf: t.Optional(t.String()),
    motorista_fone: t.Optional(t.String()),
    motorista2_fone: t.Optional(t.String()),
    motorista_fones: t.Optional(t.Array(TelefoneSchema)),
    motorista2_fones: t.Optional(t.Array(TelefoneSchema)),
  }))),
  digitado: t.Optional(t.Nullable(t.String())),
  // selo ⚠: posição no momento da macro não bate com o destino (macro por engano)
  posicao_diverge: t.Optional(t.Boolean()),
  // 'macro' (motorista acionou) | 'gps' (permanência no destino detectada sem macro)
  origem_deteccao: t.Optional(t.String()),

  // ── campos comuns aos dois formatos ─────────────────────────────────────
  motorista: t.Optional(t.String()),
  cliente: t.Optional(t.String()),
  destino: t.Optional(t.String()),
  // mesma chave, dois formatos possíveis (ver EvidenciasV1Schema/V2 acima)
  evidencias: t.Optional(t.Nullable(t.Union([EvidenciasV1Schema, EvidenciasV2Schema]))),
  // v1: {lat,lng,cidade,uf,ponto_referencia,distancia_m,quando_local}
  // v2 acrescenta km_destino/parado ao MESMO bloco — por isso os campos de
  // ambos os formatos ficam juntos aqui (não é uma união, é o mesmo objeto).
  posicao: t.Optional(t.Nullable(t.Object({
    lat: t.Optional(t.Nullable(t.String())),
    lng: t.Optional(t.Nullable(t.String())),
    cidade: t.Optional(t.String()),
    uf: t.Optional(t.String()),
    ponto_referencia: t.Optional(t.String()),
    distancia_m: t.Optional(t.Nullable(t.Number())),
    quando_local: t.Optional(t.Nullable(t.String())),
    km_destino: t.Optional(t.Nullable(t.Number())),
    parado: t.Optional(t.Boolean()),
  }, { additionalProperties: true }))),

  // ── v2 (ver V2-CONTRATO.md) ──────────────────────────────────────────────
  codman: t.Optional(t.Number()),
  filial: t.Optional(t.Number()),
  serie: t.Optional(t.String()),
  emissao_local: t.Optional(t.Nullable(t.String())),
  prazo_entrega_local: t.Optional(t.Nullable(t.String())),
  // false = o DATLME do Rodopar não serve como prazo (nulo, ou <= a emissão). Medido em
  // 17/08: 4.789 de 23.021 manifestos em 12 meses (21%) — o prazo vem herdado de lote (o
  // mesmo valor em ~100 manifestos de linhas diferentes), então a viagem que sai depois
  // daquela data já NASCE vencida. O coletor zera `horas_atraso` nesses casos; a tela usa
  // este campo pra dizer ⚪ SEM PRAZO em vez de "no prazo". Ausente = confiável (v1/antigo).
  prazo_confiavel: t.Optional(t.Boolean()),
  // nullable defensivo: coletor manda null quando o manifesto não tem
  // `emissao` (mesmo padrão do bug do sm.* acima — ver montar_item em coletor_v2.py)
  horas_aberto: t.Optional(t.Nullable(t.Number())),
  horas_atraso: t.Optional(t.Number()),
  cavalo: t.Optional(t.String()),
  carreta: t.Optional(t.String()),
  motorista_fones: t.Optional(t.Array(TelefoneSchema)),
  // CODMOT do Rodopar (RODMOT.CODMOT via M.CODMO1) — chave dos telefones que o operador
  // cadastra. t.Optional + t.Nullable porque o coletor antigo não manda e o novo manda '' quando
  // o LEFT JOIN não casa (mesma lição do sm.* acima). Sem declarar aqui, o TypeBox descarta o
  // campo em silêncio e a feature de telefone nunca liga.
  motorista_codmot: t.Optional(t.Nullable(t.String())),
  // quando o estado ATUAL começou (wall-clock local, como os outros *_local). A tela mostra
  // "descarregado há 3 h" e a validação mede o tempo entre o alerta e a baixa — impossível sem
  // isto, porque o snapshot não guarda histórico.
  estado_desde_local: t.Optional(t.Nullable(t.String())),
  destino_uf: t.Optional(t.String()),
  // abas da tela FROTA × DEMAIS (decisão Danilo 11/08 — ver V2-CONTRATO.md)
  na_frota_sascar: t.Optional(t.Boolean()),
  // comprovação física da trava do baú (só faz sentido na FROTA); null = não aplicável (DEMAIS)
  comprovacao_trava: t.Optional(t.Nullable(t.Boolean())),
  estado: t.Optional(t.Union([
    t.Literal('descarregado'),
    t.Literal('descarregando'),
    t.Literal('aguardando_descarga'),
    t.Literal('em_transito'),
    t.Literal('sem_rastreio'),
  ])),
  origem_estado: t.Optional(t.Union([t.Literal('sm'), t.Literal('sascar'), t.Literal('macro')])),
  sm: t.Optional(t.Nullable(SmSchema)),
  trava_bau: t.Optional(t.Nullable(TravaBauSchema)),
  macro: t.Optional(t.Nullable(MacroSchema)),
  destino_historico: t.Optional(t.Nullable(DestinoHistoricoSchema)),
})

const ingestPlugin = new Elysia({ name: 'manifesto-ingest' }).group('/api/manifesto', (app) =>
  app.post(
    '/pendencias',
    async ({ body, set, request }) => {
      const auth = checkApiKey(request)
      if (!auth.ok) {
        set.status = auth.status
        return { ok: false, error: auth.error }
      }
      const result = await applySnapshot(body)
      if (!result.aplicado) {
        return { ok: true, aplicado: false, motivo: result.motivo }
      }
      return { ok: true, aplicado: true, total: result.total }
    },
    {
      body: t.Object({
        // ausente no v1 (coletor.py); coletor_v2.py envia `versao: 2` — ver V2-CONTRATO.md.
        versao: t.Optional(t.Number()),
        gerado_em: t.String(),
        pendencias: t.Array(PendenciaSchema),
      }),
      detail: {
        tags: ['manifesto'],
        summary: '[API key] Recebe o snapshot completo de pendências de baixa de manifesto (coletor Sascar)',
      },
    },
  )
    // ── Fila de baixa: o AGENTE ───────────────────────────────────────────────
    // Quem chama é o script na máquina Windows que roda o robô, não um browser —
    // por isso mora aqui, fora do authGuard, com x-api-key igual ao coletor.
    .post(
      '/baixa/proximo',
      async ({ body, set, request }) => {
        const auth = checkApiKey(request)
        if (!auth.ok) {
          set.status = auth.status
          return { ok: false, error: auth.error }
        }
        // null = nada a fazer, OU já existe um executando. O Rodopar é sessão única
        // por usuário: duas execuções simultâneas derrubam uma à outra (rc=8).
        const pedido = await reivindicarProximo(body.agente)
        return { ok: true, pedido }
      },
      {
        body: t.Object({ agente: t.String({ maxLength: 120 }) }),
        detail: {
          tags: ['manifesto'],
          summary: '[API key] Agente reivindica o próximo pedido de baixa (pedido null = nada a fazer)',
        },
      },
    )
    .post(
      '/baixa/resultado',
      async ({ body, set, request }) => {
        const auth = checkApiKey(request)
        if (!auth.ok) {
          set.status = auth.status
          return { ok: false, error: auth.error }
        }
        // O rc decide: 0 concluído · 6/11 conferência humana · resto falhou. Mandar
        // `efetuar_clicado` é o que permite travar mesmo num rc fora da lista — ver
        // docs/CONVENCAO-ROBO.md §3 no repo do robô.
        const pedido = await registrarResultado({
          id: body.id,
          rc: body.rc,
          mensagem: body.mensagem ?? null,
          efetuarClicado: body.efetuar_clicado ?? null,
        })
        if (!pedido) {
          set.status = 404
          return { ok: false, error: 'pedido não encontrado' }
        }
        return { ok: true, pedido }
      },
      {
        body: t.Object({
          id: t.String({ maxLength: 40 }),
          rc: t.Integer(),
          mensagem: t.Optional(t.Nullable(t.String({ maxLength: 4000 }))),
          efetuar_clicado: t.Optional(t.Nullable(t.Boolean())),
        }),
        detail: {
          tags: ['manifesto'],
          summary: '[API key] Agente devolve o resultado da execução (rc 6/11 vira conferência humana)',
        },
      },
    ),
)

// Quem pode ESCREVER nesta tela (decisão Danilo 12/08, estendida aos telefones em 13/08): os 3
// operadores dedicados (papel 'manifesto') e a supervisão. 'analyst'/'viewer' seguem só lendo.
// Uma lista só para justificativa e telefone — duas listas iguais divergem com o tempo.
const PODE_ESCREVER = ['manifesto', 'supervisor', 'admin'] as const

const readPlugin = new Elysia({ name: 'manifesto-read' })
  .use(authGuard)
  .group('/api/manifesto', (app) =>
    app
      .get(
        '/pendencias',
        async () => {
          const view = await getPendencias()
          // Enriquece com a justificativa do operador (Postgres) — o snapshot em si é
          // volátil e sobrescrito pelo coletor, então a nota nunca mora nele. Um GET só:
          // a tela faz polling de 30s e dois requests por ciclo seria desperdício.
          const refs = view.pendencias
            .filter((p) => typeof p.codman === 'number' && typeof p.filial === 'number')
            .map((p) => ({ codman: p.codman!, filial: p.filial!, serie: p.serie }))
          // A justificativa é ADITIVA à tela: se a leitura dela falhar (deploy antes da
          // migration, banco fora), a tela dos operadores tem que continuar mostrando o
          // estado dos manifestos — que é a função crítica. Degrada para mapa vazio.
          let tratativas: Awaited<ReturnType<typeof resumoPorManifesto>> = {}
          if (refs.length) {
            try {
              tratativas = await resumoPorManifesto(refs)
            } catch (e: any) {
              logger.error(
                { error: e?.message ?? String(e) },
                '[manifesto] falha ao ler tratativas — seguindo sem elas (tabela ausente?)',
              )
            }
          }
          // Telefones que o operador cadastrou/riscou, por CODMOT. try/catch SEPARADO do de
          // tratativas de propósito: uma falha não pode esconder a outra nem levar a outra embora.
          const codmots = [...new Set(
            view.pendencias.map((p) => normalizarCodmot(p.motorista_codmot)).filter(Boolean),
          )]
          let fones_motorista: Awaited<ReturnType<typeof fonesPorMotorista>> = {}
          if (codmots.length) {
            try {
              fones_motorista = await fonesPorMotorista(codmots)
            } catch (e: any) {
              logger.error(
                { error: e?.message ?? String(e) },
                '[manifesto] falha ao ler telefones do motorista — seguindo sem eles (tabela ausente?)',
              )
            }
          }
          // Validações já feitas, para a tela marcar o que falta validar. try/catch próprio pelo
          // mesmo motivo dos anteriores: é aditivo, não pode derrubar a fila de manifestos.
          let validacoes: Awaited<ReturnType<typeof validacoesPorManifesto>> = {}
          if (refs.length) {
            try {
              validacoes = await validacoesPorManifesto(refs)
            } catch (e: any) {
              logger.error(
                { error: e?.message ?? String(e) },
                '[manifesto] falha ao ler validações — seguindo sem elas (tabela ausente?)',
              )
            }
          }
          // Pedidos de baixa (20/08), para a tela pintar o botão. try/catch próprio pelo mesmo
          // motivo dos anteriores: é aditivo. Sem isto a tela cai para "nenhum pedido", que é o
          // estado seguro — botão disponível, e o índice único do banco recusa duplicata.
          let baixa_pedidos: Awaited<ReturnType<typeof pedidosPorManifesto>> = {}
          if (refs.length) {
            try {
              baixa_pedidos = await pedidosPorManifesto(refs)
            } catch (e: any) {
              logger.error(
                { error: e?.message ?? String(e) },
                '[manifesto] falha ao ler pedidos de baixa — seguindo sem eles (tabela ausente?)',
              )
            }
          }
          // Há agente de plantão? Sem isto a tela mostra "NA FILA" com cara de que algo
          // está acontecendo mesmo quando não existe ninguém para pegar o pedido.
          const agente_fila = await agenteDePlantao()
          return {
            ok: true,
            ...view,
            baixa_pedidos,
            agente_fila,
            tratativas,
            motivos: MOTIVOS_TRATATIVA,
            fones_motorista,
            rotulos_fone: ROTULOS_FONE,
            validacoes,
            motivos_erro: MOTIVOS_ERRO,
          }
        },
        {
          detail: {
            tags: ['manifesto'],
            summary: 'Snapshot atual de pendências de baixa de manifesto (tela /baixa-manifesto)',
          },
        },
      )
      // Relatório de motivos (13/08). Mora dentro da tela de manifesto, então quem vê a tela vê o
      // relatório: só authGuard, igual ao GET /pendencias. Sem quebra por autor (decisão Danilo) —
      // o papel `manifesto` é confinado por prefixo de URL, e corte por autor é dado de avaliação.
      .get(
        '/tratativas/relatorio',
        async ({ query, set }) => {
          try {
            return { ok: true, ...(await relatorioTratativas(query.inicio, query.fim)) }
          } catch (e: any) {
            // Tolerância INVERTIDA em relação ao GET /pendencias: lá a justificativa é aditiva a uma
            // tela crítica e degradar para vazio é o certo. Aqui o relatório AFIRMA um fato, e
            // relatório vazio seria lido como "ninguém justificou" — falhar alto é mais honesto.
            logger.error({ error: e?.message ?? String(e) }, '[manifesto] relatório de tratativas falhou')
            set.status = 503
            return {
              ok: false,
              error: 'não foi possível montar o relatório — verifique se a migration das justificativas foi aplicada',
            }
          }
        },
        {
          // pattern não é decoração: o bound entra numa expressão ::timestamp, então 'abc' viraria
          // 500 do Postgres em vez de erro útil
          query: t.Object({
            inicio: t.Optional(t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
            fim: t.Optional(t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
          }),
          detail: {
            tags: ['manifesto'],
            summary: 'Distribuição de motivos das justificativas + cobertura dos vencidos',
          },
        },
      )
      // Histórico completo de um manifesto — o painel de detalhes abre sob demanda,
      // então não precisa vir no snapshot de todos.
      .get(
        '/tratativas/:codman/:filial',
        async ({ params, query, set }) => {
          // params vêm como string: /tratativas/abc/xyz daria NaN e o insert/select em coluna
          // integer estouraria com 500. Valida antes e devolve 400 com mensagem útil.
          const codman = Number(params.codman)
          const filial = Number(params.filial)
          if (!Number.isSafeInteger(codman) || !Number.isSafeInteger(filial)) {
            set.status = 400
            return { ok: false, error: 'codman e filial devem ser inteiros' }
          }
          return { ok: true, tratativas: await historicoManifesto(codman, filial, query.serie ?? '') }
        },
        {
          params: t.Object({ codman: t.String(), filial: t.String() }),
          query: t.Object({ serie: t.Optional(t.String()) }),
          detail: {
            tags: ['manifesto'],
            summary: 'Histórico de justificativas de um manifesto',
          },
        },
      )
      .post(
        '/tratativas',
        async ({ body, user, set }) => {
          // Gate na PRÓPRIA rota, não via requireRole: o onBeforeHandle dele é 'local' e
          // não alcança a rota do consumidor, o que deixaria isto ABERTO (ver a nota em
          // audit.plugin.ts). O servidor é a fonte da verdade; a tela só esconde o botão.
          if (!PODE_ESCREVER.includes(user.role as (typeof PODE_ESCREVER)[number])) {
            set.status = 403
            return { ok: false, error: `Forbidden: requires role ${PODE_ESCREVER.join('|')}` }
          }
          if (!motivoValido(body.motivo)) {
            set.status = 400
            return {
              ok: false,
              error: `motivo inválido — use um de: ${Object.keys(MOTIVOS_TRATATIVA).join(', ')}`,
            }
          }
          const registro = await registrarTratativa({
            codman: body.codman,
            filial: body.filial,
            serie: body.serie ?? '',
            placa: body.placa ?? null,
            destino: body.destino ?? null,
            motivo: body.motivo,
            notes: body.notes ?? null,
            operatorId: user.id,
            // o serviço resolve o nome pelo id (o JWT só traz id/role/jti). Nunca vem do
            // corpo do request: o cliente não escolhe sob qual nome assina.
            authorName: null,
          })
          return { ok: true, tratativa: registro, chave: chaveManifesto(body.codman, body.filial, body.serie) }
        },
        {
          // maxLength no notes/motivo: sem isso um texto de megabytes seria aceito e gravado.
          // Placa/serie/destino são ACESSÓRIOS (só enfeitam o relatório) e ficam folgados de
          // propósito — o service trunca no tamanho da coluna. Rejeitar a requisição por causa
          // de um destino comprido perderia a justificativa que o operador acabou de escrever.
          body: t.Object({
            codman: t.Integer(),
            filial: t.Integer(),
            serie: t.Optional(t.String({ maxLength: 20 })),
            placa: t.Optional(t.String({ maxLength: 20 })),
            destino: t.Optional(t.String({ maxLength: 200 })),
            motivo: t.String({ maxLength: 40 }),
            notes: t.Optional(t.String({ maxLength: 2000 })),
          }),
          detail: {
            tags: ['manifesto'],
            summary: 'Registra justificativa do operador (append-only) — papel manifesto/supervisor/admin',
          },
        },
      )
      // ── Validação do sistema pelo operador (13/08) ───────────────────────────
      // Mede se o alerta está certo. O corpo carrega a FOTO do que a tela mostrava (estado,
      // origem, evidências) porque o snapshot é sobrescrito a cada 5 min — sem ela a acurácia
      // não é calculável depois. Ver drizzle/manifesto-validacoes.sql.
      .post(
        '/validacoes',
        async ({ body, user, set }) => {
          if (!PODE_ESCREVER.includes(user.role as (typeof PODE_ESCREVER)[number])) {
            set.status = 403
            return { ok: false, error: `Forbidden: requires role ${PODE_ESCREVER.join('|')}` }
          }
          if (body.veredito === 'incorreto' && body.motivo_erro && !motivoErroValido(body.motivo_erro)) {
            set.status = 400
            return {
              ok: false,
              error: `motivo_erro inválido — use um de: ${Object.keys(MOTIVOS_ERRO).join(', ')}`,
            }
          }
          const registro = await registrarValidacao({
            codman: body.codman,
            filial: body.filial,
            serie: body.serie ?? '',
            estadoSistema: body.estado_sistema,
            origemEstado: body.origem_estado ?? null,
            evidencias: body.evidencias ?? null,
            comprovacaoTrava: body.comprovacao_trava ?? null,
            naFrota: body.na_frota ?? null,
            estadoDesde: body.estado_desde ?? null,
            veredito: body.veredito,
            motivoErro: body.motivo_erro ?? null,
            observacao: body.observacao ?? null,
            baixou: body.baixou ?? false,
            placa: body.placa ?? null,
            destino: body.destino ?? null,
            operatorId: user.id,
          })
          return { ok: true, validacao: registro }
        },
        {
          body: t.Object({
            codman: t.Integer(),
            filial: t.Integer(),
            serie: t.Optional(t.String({ maxLength: 20 })),
            // a foto do momento — o cliente manda porque é o que ELE estava vendo; o servidor não
            // pode reconstruir (o snapshot pode já ter mudado entre a leitura e o clique)
            estado_sistema: t.String({ maxLength: 30 }),
            origem_estado: t.Optional(t.Nullable(t.String({ maxLength: 10 }))),
            evidencias: t.Optional(t.Nullable(t.Array(t.String({ maxLength: 60 })))),
            comprovacao_trava: t.Optional(t.Nullable(t.Boolean())),
            na_frota: t.Optional(t.Nullable(t.Boolean())),
            estado_desde: t.Optional(t.Nullable(t.String({ maxLength: 40 }))),
            veredito: t.Union([t.Literal('correto'), t.Literal('incorreto')]),
            motivo_erro: t.Optional(t.Nullable(t.String({ maxLength: 40 }))),
            observacao: t.Optional(t.String({ maxLength: 2000 })),
            baixou: t.Optional(t.Boolean()),
            placa: t.Optional(t.String({ maxLength: 20 })),
            destino: t.Optional(t.String({ maxLength: 200 })),
          }),
          detail: {
            tags: ['manifesto'],
            summary: 'Operador valida se o sistema acertou — papel manifesto/supervisor/admin',
          },
        },
      )
      .get(
        '/validacoes/acuracia',
        async ({ query, set }) => {
          try {
            return { ok: true, ...(await acuraciaSistema(Number(query.dias ?? 30))) }
          } catch (e: any) {
            // falha alto, como o relatório de motivos: número ausente aqui seria lido como
            // "o sistema nunca errou", que é pior que erro visível
            logger.error({ error: e?.message ?? String(e) }, '[manifesto] acurácia falhou')
            set.status = 503
            return { ok: false, error: 'não foi possível calcular a acurácia — migration aplicada?' }
          }
        },
        {
          query: t.Object({ dias: t.Optional(t.String({ pattern: '^\\d{1,3}$' })) }),
          detail: {
            tags: ['manifesto'],
            summary: 'Precisão do alerta medida pelas validações dos operadores',
          },
        },
      )
      // ── Telefones do motorista (13/08) ───────────────────────────────────────
      // O Rodopar manda UM número por motorista (medido: 87/87) e é read-only para nós. Se ele
      // não atende, o operador não tem alternativa — daí poder cadastrar e riscar.
      .post(
        '/motorista-fones',
        async ({ body, user, set }) => {
          if (!PODE_ESCREVER.includes(user.role as (typeof PODE_ESCREVER)[number])) {
            set.status = 403
            return { ok: false, error: `Forbidden: requires role ${PODE_ESCREVER.join('|')}` }
          }
          const codmot = normalizarCodmot(body.codmot)
          if (!codmot) {
            set.status = 422
            return {
              ok: false,
              error: 'codmot ausente — este manifesto não trouxe o código do motorista (coletor antigo?)',
            }
          }
          const digitos = digitosFone(body.numero)
          if (!foneValido(digitos)) {
            set.status = 422
            return { ok: false, error: 'informe DDD + número (10 ou 11 dígitos)' }
          }
          const { fone, jaExistia } = await adicionarFone({
            codmot,
            numero: body.numero,
            rotulo: body.rotulo ?? null,
            motoristaNome: body.motorista_nome ?? null,
            operatorId: user.id,
          })
          return { ok: true, fone, ja_existia: jaExistia }
        },
        {
          body: t.Object({
            codmot: t.String({ maxLength: 30 }),
            numero: t.String({ maxLength: 40 }),
            rotulo: t.Optional(t.String({ maxLength: 40 })),
            motorista_nome: t.Optional(t.String({ maxLength: 200 })),
          }),
          detail: {
            tags: ['manifesto'],
            summary: 'Cadastra telefone do motorista — papel manifesto/supervisor/admin',
          },
        },
      )
      // PUT idempotente com booleano em vez de duas rotas (mesmo idioma de PUT /api/gr/spx/override).
      // Serve os dois casos: número do Rodopar (cria a linha de override) e número nosso (atualiza).
      .put(
        '/motorista-fones/marca',
        async ({ body, user, set }) => {
          if (!PODE_ESCREVER.includes(user.role as (typeof PODE_ESCREVER)[number])) {
            set.status = 403
            return { ok: false, error: `Forbidden: requires role ${PODE_ESCREVER.join('|')}` }
          }
          const codmot = normalizarCodmot(body.codmot)
          if (!codmot) {
            set.status = 422
            return { ok: false, error: 'codmot ausente — este manifesto não trouxe o código do motorista' }
          }
          const digitos = digitosFone(body.numero)
          if (!foneValido(digitos)) {
            set.status = 422
            return { ok: false, error: 'informe DDD + número (10 ou 11 dígitos)' }
          }
          const fone = await marcarFone({
            codmot,
            numero: body.numero,
            naoFunciona: body.nao_funciona,
            rotulo: body.rotulo ?? null,
            motoristaNome: body.motorista_nome ?? null,
            operatorId: user.id,
          })
          return { ok: true, fone }
        },
        {
          // `origem` NÃO está no body de propósito: o servidor decide (linha nova = veio do
          // Rodopar; linha existente mantém a origem que tinha). O cliente não rebatiza registro.
          body: t.Object({
            codmot: t.String({ maxLength: 30 }),
            numero: t.String({ maxLength: 40 }),
            nao_funciona: t.Boolean(),
            rotulo: t.Optional(t.String({ maxLength: 40 })),
            motorista_nome: t.Optional(t.String({ maxLength: 200 })),
          }),
          detail: {
            tags: ['manifesto'],
            summary: 'Marca/desmarca telefone como "não funciona" — papel manifesto/supervisor/admin',
          },
        },
      )
      // ── Botão de baixa (20/08) ──────────────────────────────────────────────
      // Pedir a baixa é ato IRREVERSÍVEL no ERP: o robô clica Efetuar de verdade.
      // Mesmo papel que já escreve nesta tela (justificativa e telefone) — uma
      // lista só, porque duas listas iguais divergem com o tempo.
      //
      // Quem pediu SÓ existe aqui: o Rodopar carimba USUEFE='AGENDADOR' na baixa do
      // robô E na de pessoa clicando Efetuar, sem distinguir os dois.
      .post(
        '/baixa/pedidos',
        async ({ body, user, set }) => {
          if (!PODE_ESCREVER.includes(user.role as (typeof PODE_ESCREVER)[number])) {
            set.status = 403
            return { ok: false, error: `Forbidden: requires role ${PODE_ESCREVER.join('|')}` }
          }
          const r = await pedirBaixa({
            codman: body.codman,
            filial: body.filial,
            serie: body.serie ?? '',
            placa: body.placa ?? null,
            destino: body.destino ?? null,
            estadoSistema: body.estado_sistema ?? null,
            operatorId: user.id,
          })
          if (!r.ok) {
            // 409: não é erro do cliente nem do servidor — é "já tem um em andamento",
            // e a tela precisa mostrar o motivo, que pode ser conferência pendente.
            set.status = 409
            return { ok: false, error: r.motivo, pedido: r.pedido ?? null }
          }
          return { ok: true, pedido: r.pedido }
        },
        {
          body: t.Object({
            codman: t.Integer(),
            filial: t.Integer(),
            serie: t.Optional(t.String({ maxLength: 20 })),
            // foto do momento: o snapshot do Redis é sobrescrito a cada 5 min
            placa: t.Optional(t.String({ maxLength: 20 })),
            destino: t.Optional(t.String({ maxLength: 200 })),
            estado_sistema: t.Optional(t.String({ maxLength: 30 })),
          }),
          detail: {
            tags: ['manifesto'],
            summary: 'Pede a baixa do manifesto ao robô — papel manifesto/supervisor/admin',
          },
        },
      )
      // Libera manifesto parado em `conferencia`, DEPOIS de a pessoa conferir no
      // Rodopar. Espelho do `--liberar-clique` do robô: a dúvida acaba porque alguém
      // olhou, não porque o tempo passou. Fica registrado quem liberou.
      .post(
        '/baixa/liberar',
        async ({ body, user, set }) => {
          if (!PODE_ESCREVER.includes(user.role as (typeof PODE_ESCREVER)[number])) {
            set.status = 403
            return { ok: false, error: `Forbidden: requires role ${PODE_ESCREVER.join('|')}` }
          }
          const pedido = await liberarConferencia(body.id, user.id)
          if (!pedido) {
            set.status = 404
            return { ok: false, error: 'pedido não encontrado ou não está em conferência' }
          }
          return { ok: true, pedido }
        },
        {
          body: t.Object({ id: t.String({ maxLength: 40 }) }),
          detail: {
            tags: ['manifesto'],
            summary: 'Libera pedido em conferência após checagem humana — papel manifesto/supervisor/admin',
          },
        },
      ),
  )

export const manifestoPlugin = new Elysia({ name: 'manifesto' })
  .use(ingestPlugin)
  .use(readPlugin)
