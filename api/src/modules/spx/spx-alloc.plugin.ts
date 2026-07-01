/**
 * spx-alloc.plugin.ts — API de ALOCAÇÃO SPX para outros sistemas (machine-to-machine).
 *
 * Mesmo padrão do spx.plugin (asp): auth por API KEY, NÃO por sessão de browser.
 *   Authorization: Bearer <SPX_ALLOC_API_KEY>   (ou header  x-api-key: <chave>)
 *   (fallback: SPX_ASP_API_KEY, se SPX_ALLOC_API_KEY não estiver definido)
 *
 *   GET  /api/spx/allocacao/trips    — viagens atribuíveis (status Assigning, sem motorista)
 *   GET  /api/spx/allocacao/drivers  — motoristas atribuíveis (driver_id + nome); ?nome= filtra
 *   POST /api/spx/allocacao/assign   — aloca motorista + veículo (cavalo/carreta) na viagem
 *
 * A escrita REAL no aspx só ocorre com SPX_ALLOC_WRITE_ENABLED ligado; senão (ou com
 * dry_run:true no body) a requisição é só MONTADA e devolvida, sem enviar. Reusa o
 * mesmo adapter do sidecar usado pela tela da Torre — fonte única de verdade.
 */
import { Elysia, t } from 'elysia'
import { getAssignableTrips, getAssignableDrivers, allocateTrip } from '../../adapters/spx-sidecar/allocacao.adapter'

function checkApiKey(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.SPX_ALLOC_API_KEY || process.env.SPX_ASP_API_KEY
  if (!expected) {
    return { ok: false, status: 503, error: 'SPX_ALLOC_API_KEY (ou SPX_ASP_API_KEY) não configurado no servidor' }
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

function writeEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.SPX_ALLOC_WRITE_ENABLED ?? '')
}

function flattenSteps(out: any): Array<{ etapa: string; method?: string; path?: string; body?: unknown }> {
  return (out?.steps ?? []).map((s: any) => {
    const etapa = Object.keys(s)[0] ?? ''
    const v = s[etapa] ?? {}
    return { etapa: etapa === 'accept' ? 'aceitar' : etapa === 'assign' ? 'atribuir' : etapa, method: v.method, path: v.path, body: v.body }
  })
}

export const spxAllocPlugin = new Elysia({ name: 'spx-alloc-integration' }).group('/api/spx/allocacao', (app) =>
  app
    .get(
      '/trips',
      async ({ query, set, request }) => {
        const auth = checkApiKey(request)
        if (!auth.ok) { set.status = auth.status; return { ok: false, error: auth.error } }
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
        detail: { tags: ['spx'], summary: '[API key] Viagens atribuíveis (status Assigning, sem motorista)' },
      },
    )
    .get(
      '/drivers',
      async ({ query, set, request }) => {
        const auth = checkApiKey(request)
        if (!auth.ok) { set.status = auth.status; return { ok: false, error: auth.error } }
        try {
          const agencyId = query.agency_id ? Number(query.agency_id) : undefined
          const data = await getAssignableDrivers({ agencyId })
          const nome = (query.nome ?? '').trim().toLowerCase()
          const drivers = nome ? data.drivers.filter((d) => (d.name || '').toLowerCase().includes(nome)) : data.drivers
          return { ok: true, total: drivers.length, agency_id: data.agency_id, drivers }
        } catch (e: any) {
          set.status = 502
          return { ok: false, error: e?.message ?? 'falha ao listar motoristas', drivers: [] }
        }
      },
      {
        query: t.Object({ nome: t.Optional(t.String()), agency_id: t.Optional(t.String()) }),
        detail: { tags: ['spx'], summary: '[API key] Motoristas atribuíveis (driver_id + nome); ?nome= filtra por nome' },
      },
    )
    .post(
      '/assign',
      async ({ body, set, request }) => {
        const auth = checkApiKey(request)
        if (!auth.ok) { set.status = auth.status; return { ok: false, error: auth.error } }
        try {
          // Aceita trip_id direto OU resolve por trip_number (LH) entre as viagens atribuíveis.
          let tripId = body.trip_id != null ? Number(body.trip_id) : undefined
          if (!tripId && body.trip_number) {
            const { trips } = await getAssignableTrips({ stationId: body.station_id })
            const m = trips.find((tr) => tr.trip_number === body.trip_number)
            if (!m) { set.status = 404; return { ok: false, error: `trip_number ${body.trip_number} não encontrado entre as viagens atribuíveis` } }
            tripId = m.trip_id
          }
          if (!tripId) { set.status = 422; return { ok: false, error: 'informe trip_id ou trip_number' } }

          // Real só se gate ligado E não pediu dry_run. Senão, monta o body sem enviar.
          const dryRun = body.dry_run === true || !writeEnabled()
          const out = await allocateTrip({
            tripId,
            driverIds: body.driver_ids,
            vehiclePlates: body.vehicle_plates,
            stationId: body.station_id,
            aceitar: body.aceitar,
            dryRun,
          })
          return {
            ok: true,
            trip_id: tripId,
            writeEnabled: writeEnabled(),
            dry_run: out?.dry_run ?? dryRun,
            enviado_ao_aspx: out?.dry_run === false,
            steps: flattenSteps(out),
          }
        } catch (e: any) {
          set.status = 502
          return { ok: false, error: e?.message ?? 'falha na alocação' }
        }
      },
      {
        body: t.Object({
          trip_id: t.Optional(t.Union([t.Number(), t.String()])),
          trip_number: t.Optional(t.String()),
          driver_ids: t.Array(t.Number(), { minItems: 1 }),
          vehicle_plates: t.Optional(t.Array(t.String())), // [cavalo, carreta]
          station_id: t.Optional(t.Number()),
          aceitar: t.Optional(t.Boolean()),
          dry_run: t.Optional(t.Boolean()),
        }),
        detail: {
          tags: ['spx'],
          summary: '[API key] Aloca motorista + veículo na viagem SPX (real se SPX_ALLOC_WRITE_ENABLED; dry_run:true simula)',
        },
      },
    ),
)
