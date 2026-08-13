import { Elysia, t } from 'elysia'

import { authGuard } from '../../lib/rbac'
import { logger } from '../../lib/logger'
import { MOTIVOS_TRATATIVA, ROTULOS_FONE } from '../../db/schema'
import {
  adicionarFone,
  digitosFone,
  fonesPorMotorista,
  foneValido,
  marcarFone,
  normalizarCodmot,
} from './motorista-fones.service'
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
          return {
            ok: true,
            ...view,
            tratativas,
            motivos: MOTIVOS_TRATATIVA,
            fones_motorista,
            rotulos_fone: ROTULOS_FONE,
          }
        },
        {
          detail: {
            tags: ['manifesto'],
            summary: 'Snapshot atual de pendências de baixa de manifesto (tela /baixa-manifesto)',
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
      ),
  )

export const manifestoPlugin = new Elysia({ name: 'manifesto' })
  .use(ingestPlugin)
  .use(readPlugin)
