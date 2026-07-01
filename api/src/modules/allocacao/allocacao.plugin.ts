/**
 * Alocação de motorista em viagem SPX linehaul — rotas atrás do authGuard (cookie Torre).
 *
 *   GET  /api/allocacao/drivers/assignable        — motoristas atribuíveis (driver_id + nome)
 *   POST /api/allocacao/trips/:trip_id/assign      — aloca motorista(s) na viagem
 *
 * Repassa para o sidecar spx-bot (allocacao.adapter). Mesmo padrão de
 * operacional/cargas: `.group('/api/...')` para o derive do authGuard propagar.
 *
 * SEGURANÇA: a escrita REAL no SPX (dry_run=false) só acontece quando
 * SPX_ALLOC_WRITE_ENABLED estiver ligado. Por padrão TUDO é dry-run (monta a
 * requisição mas NÃO envia ao aspx). Mesmo gate do CARGAS_WRITE_ENABLED.
 */
import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import { getAssignableDrivers, getAssignableTrips, allocateTrip } from '../../adapters/spx-sidecar/allocacao.adapter'

function writeEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.SPX_ALLOC_WRITE_ENABLED ?? '')
}

export const allocacaoPlugin = new Elysia({ name: 'allocacao' })
  .use(authGuard)
  .group('/api/allocacao', (app) =>
    app
      .get(
        '/trips/open',
        async ({ query, set }) => {
          try {
            const stationId = query.station_id ? Number(query.station_id) : undefined
            const data = await getAssignableTrips({ stationId })
            return { ok: true, ...data }
          } catch (e: any) {
            set.status = 502
            return { ok: false, error: e?.message ?? 'falha ao listar viagens', trips: [] }
          }
        },
        {
          query: t.Object({ station_id: t.Optional(t.String()) }),
          detail: { tags: ['spx'], summary: 'Viagens atribuíveis (status Assigning, sem motorista) via sidecar' },
        },
      )
      .get(
        '/drivers/assignable',
        async ({ query, set }) => {
          try {
            const agencyId = query.agency_id ? Number(query.agency_id) : undefined
            const data = await getAssignableDrivers({ agencyId })
            return { ok: true, ...data }
          } catch (e: any) {
            set.status = 502
            return { ok: false, error: e?.message ?? 'falha ao listar motoristas', drivers: [] }
          }
        },
        {
          query: t.Object({ agency_id: t.Optional(t.String()) }),
          detail: { tags: ['spx'], summary: 'Motoristas atribuíveis (driver_id + nome) via sidecar' },
        },
      )
      .post(
        '/trips/:trip_id/assign',
        async ({ params, body, set }) => {
          // Real (dry_run=false) só se pedido E habilitado por env. Caso contrário, dry-run.
          const pediuReal = body.dry_run === false
          const dryRun = !(pediuReal && writeEnabled())
          try {
            const out = await allocateTrip({
              tripId: Number(params.trip_id),
              driverIds: body.driver_ids,
              vehiclePlates: body.vehicle_plates,
              stationId: body.station_id,
              aceitar: body.aceitar,
              dryRun,
            })
            // Achata os steps do sidecar ({accept:{...}}/{assign:{...}}) p/ a UI.
            const steps = (out?.steps ?? []).map((s: any) => {
              const etapa = Object.keys(s)[0] ?? ''
              const v = s[etapa] ?? {}
              const label = etapa === 'accept' ? '1. aceitar' : etapa === 'assign' ? '2. atribuir' : etapa
              return { etapa: label, method: v.method, path: v.path, body: v.body, aviso: v.aviso }
            })
            return {
              ok: true,
              writeEnabled: writeEnabled(),
              forcedDryRun: pediuReal && !writeEnabled(), // pediu real mas o gate barrou
              dry_run: out?.dry_run ?? dryRun,
              enviado_ao_aspx: out?.dry_run === false,
              steps,
            }
          } catch (e: any) {
            set.status = 502
            return { ok: false, error: e?.message ?? 'falha na alocação' }
          }
        },
        {
          params: t.Object({ trip_id: t.String() }),
          body: t.Object({
            driver_ids: t.Array(t.Number(), { minItems: 1 }),
            vehicle_plates: t.Optional(t.Array(t.String())),
            station_id: t.Optional(t.Number()),
            aceitar: t.Optional(t.Boolean()),
            dry_run: t.Optional(t.Boolean()),
          }),
          detail: {
            tags: ['spx'],
            summary: 'Aloca motorista(s) numa viagem (dry-run por padrão; real gated por SPX_ALLOC_WRITE_ENABLED)',
          },
        },
      ),
  )
