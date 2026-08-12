import { Elysia, t } from 'elysia'

import { authGuard } from '../../lib/rbac'
import { applySnapshot, getPendencias } from './manifesto.service'

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

const readPlugin = new Elysia({ name: 'manifesto-read' })
  .use(authGuard)
  .group('/api/manifesto', (app) =>
    app.get(
      '/pendencias',
      async () => {
        const view = await getPendencias()
        return { ok: true, ...view }
      },
      {
        detail: {
          tags: ['manifesto'],
          summary: 'Snapshot atual de pendências de baixa de manifesto (tela /baixa-manifesto)',
        },
      },
    ),
  )

export const manifestoPlugin = new Elysia({ name: 'manifesto' })
  .use(ingestPlugin)
  .use(readPlugin)
