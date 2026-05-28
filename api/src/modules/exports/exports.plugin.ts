import { Elysia, t } from 'elysia'
import { authGuard } from '../../lib/rbac'
import {
  streamTripsCsv,
  streamAlertsCsv,
  streamTreatmentsCsv,
  streamMotoristasCsv,
} from './exports.service'
import { dateStamp } from './exports.csv'

/**
 * CSV exports API plugin — 4 endpoints under /api/exports/*.csv.
 *
 * CRITICAL: the handler MUST wrap the ReadableStream in `new Response(stream, { headers })`.
 * Returning the bare ReadableStream from an Elysia handler triggers the 100 %-CPU
 * loop documented in Elysia issue #1741 (the bug is fixed in 1.4.28, but the
 * Response wrap is more robust and works on every minor we may upgrade to).
 *
 * Headers per endpoint:
 *   Content-Type:        text/csv; charset=utf-8
 *   Content-Disposition: attachment; filename="<entity>_<dateStamp>.csv"
 *   Cache-Control:       no-store
 *
 * The download is triggered client-side via `window.location.href = ...` so the
 * HttpOnly auth cookie is automatically sent (CONTEXT D-09 integration note).
 *
 * @see CONTEXT D-06..D-10
 * @see RESEARCH Pitfall #4 (lines 1148-1153)
 */

function csvResponse(stream: ReadableStream<Uint8Array>, entity: string): Response {
  const filename = `${entity}_${dateStamp()}.csv`
  return new Response(stream, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}

export const exportsPlugin = new Elysia({ name: 'exports' })
  .use(authGuard)
  .get(
    '/api/exports/viagens.csv',
    ({ query }) => csvResponse(streamTripsCsv(query), 'viagens'),
    {
      query: t.Object({
        status:     t.Optional(t.String()),
        slaStatus:  t.Optional(t.String()),
        priority:   t.Optional(t.String()),
        clientName: t.Optional(t.String()),
        driverName: t.Optional(t.String()),
        routeCode:  t.Optional(t.String()),
        search:     t.Optional(t.String()),
      }),
      detail: {
        tags: ['exports'],
        summary: 'Export trips as CSV (UTF-8 BOM, ; delim, max 50k rows)',
      },
    },
  )
  .get(
    '/api/exports/alertas.csv',
    ({ query }) => csvResponse(streamAlertsCsv(query), 'alertas'),
    {
      query: t.Object({
        severity: t.Optional(t.String()),
        status:   t.Optional(t.String()),
        type:     t.Optional(t.String()),
        search:   t.Optional(t.String()),
      }),
      detail: {
        tags: ['exports'],
        summary: 'Export alerts as CSV (UTF-8 BOM, ; delim, max 50k rows)',
      },
    },
  )
  .get(
    '/api/exports/tratativas.csv',
    ({ query }) => csvResponse(streamTreatmentsCsv(query), 'tratativas'),
    {
      query: t.Object({
        operatorId: t.Optional(t.String()),
        outcome:    t.Optional(t.String()),
        actionType: t.Optional(t.String()),
      }),
      detail: {
        tags: ['exports'],
        summary: 'Export treatments as CSV (UTF-8 BOM, ; delim, max 50k rows)',
      },
    },
  )
  .get(
    '/api/exports/motoristas.csv',
    ({ query }) => csvResponse(streamMotoristasCsv(query), 'motoristas'),
    {
      query: t.Object({
        status: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
      detail: {
        tags: ['exports'],
        summary: 'Export drivers as CSV (UTF-8 BOM, ; delim, max 50k rows)',
      },
    },
  )
