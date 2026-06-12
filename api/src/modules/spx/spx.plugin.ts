/**
 * spx.plugin.ts — Phase 15
 *
 * GET /api/spx/asp — viagens SPX linehaul no formato da planilha "asp" (15 colunas),
 * ao vivo via HTTP (sem copia-e-cola). JSON por default, CSV com ?format=csv.
 *
 * authGuard no nível do plugin (padrão positions/ranking). GET sem body — não
 * sofre o bug Elysia 1.4.28. Registrado ANTES do wsPlugin (regra plugin-last).
 * Erros (sessão SPX expirada, cookies ausentes) propagam pro onError global.
 */
import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { fetchAspRows, aspRowsToCsv, ASP_COLUMNS } from '../../adapters/spx-portal/asp.adapter'

export const spxPlugin = new Elysia({ name: 'spx-asp' })
  .use(authGuard)
  .group('/api/spx', (app) =>
    app.get(
      '/asp',
      async ({ query, set }) => {
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
          summary: 'Viagens SPX linehaul (equivalente à aba asp) — 15 colunas, JSON ou CSV (?format=csv)',
        },
      },
    ),
  )
