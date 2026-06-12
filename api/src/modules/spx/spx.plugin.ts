/**
 * spx.plugin.ts — Phase 15
 *
 * GET /api/spx/asp — viagens SPX linehaul no formato da planilha "asp" (15 colunas),
 * ao vivo via HTTP. Endpoint MÁQUINA-A-MÁQUINA (consumido por outros sistemas):
 * auth por API key, NÃO por sessão de browser.
 *
 *   Authorization: Bearer <SPX_ASP_API_KEY>   (ou header x-api-key: <chave>)
 *
 * JSON por default; CSV com ?format=csv. Em falha, devolve o erro REAL
 * (ex.: cookies vazios, sessão SPX expirada, Supabase sem permissão) em vez de
 * "Internal server error" — pra ser debugável do outro lado.
 */
import { Elysia, t } from 'elysia'
import { fetchAspRows, aspRowsToCsv, ASP_COLUMNS } from '../../adapters/spx-portal/asp.adapter'

function checkApiKey(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.SPX_ASP_API_KEY
  if (!expected) {
    return { ok: false, status: 503, error: 'SPX_ASP_API_KEY não configurado no servidor — defina o secret e redeploy' }
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

export const spxPlugin = new Elysia({ name: 'spx-asp' }).group('/api/spx', (app) =>
  app.get(
    '/asp',
    async ({ query, set, request }) => {
      const auth = checkApiKey(request)
      if (!auth.ok) {
        set.status = auth.status
        return { ok: false, error: auth.error }
      }
      try {
        const { fetched, rows } = await fetchAspRows({
          daysBack: query.days_back ? Number(query.days_back) : undefined,
          daysFwd: query.days_fwd ? Number(query.days_fwd) : undefined,
          station: query.station,
        })
        if (query.format === 'csv') {
          set.headers['content-type'] = 'text/csv; charset=utf-8'
          set.headers['content-disposition'] = 'attachment; filename="spx_asp.csv"'
          return aspRowsToCsv(rows)
        }
        return { ok: true, columns: ASP_COLUMNS, total: fetched, rows }
      } catch (e) {
        set.status = 502
        return { ok: false, error: (e as Error)?.message ?? String(e) }
      }
    },
    {
      query: t.Object({
        format: t.Optional(t.Union([t.Literal('json'), t.Literal('csv')])),
        days_back: t.Optional(t.String()),
        days_fwd: t.Optional(t.String()),
        station: t.Optional(t.String()),
      }),
      detail: {
        tags: ['spx'],
        summary: 'Viagens SPX linehaul (aba asp) via HTTP — auth por x-api-key/Bearer; JSON ou CSV (?format=csv)',
      },
    },
  ),
)
