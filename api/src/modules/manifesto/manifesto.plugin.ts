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

// chegada_gmt/chegada_local/fim_gmt/fim_local chegam null explícito quando a
// pendência nasce do outro lado do ciclo (ex.: fim de viagem ainda sem chegada
// registrada) — ver pendencias.json real. t.Nullable é obrigatório aqui.
const PendenciaSchema = t.Object({
  codlpr: t.Number(),
  placa: t.String(),
  motorista: t.String(),
  cliente: t.String(),
  destino: t.String(),
  estagio: t.Union([t.Literal('descarregando'), t.Literal('descarregado')]),
  manifestos: t.Array(ManifestoRefSchema),
  chegada_gmt: t.Nullable(t.String()),
  chegada_local: t.Nullable(t.String()),
  fim_gmt: t.Nullable(t.String()),
  fim_local: t.Nullable(t.String()),
  idPacote: t.Nullable(t.String()),
  detectada_em: t.String(),
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
