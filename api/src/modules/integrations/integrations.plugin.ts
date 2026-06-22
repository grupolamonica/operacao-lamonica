/**
 * API de integração para consumo por outros sistemas (server-to-server).
 *
 * Fora do authGuard JWT (que é de browser/cookie): autentica por header
 * `x-api-key` (ou `Authorization: Bearer <key>`) comparado a INTEGRATION_API_KEY.
 * Se a env não estiver definida, o endpoint nega tudo (401) — seguro por padrão.
 */

import { Elysia, t } from 'elysia'
import { getDriverFullByCpf } from './integrations.service'

const INTEGRATION_API_KEY = process.env.INTEGRATION_API_KEY ?? ''

export const integrationsPlugin = new Elysia({ name: 'integrations' })
  .group('/api/integrations', (app) =>
    app
      .onBeforeHandle(({ headers, set }) => {
        const h = headers as Record<string, string | undefined>
        const key = h['x-api-key'] ?? h['authorization']?.replace('Bearer ', '')
        if (!INTEGRATION_API_KEY || key !== INTEGRATION_API_KEY) {
          set.status = 401
          return { error: 'Invalid API key' }
        }
      })
      .get(
        '/drivers/:cpf',
        async ({ params, set }) => {
          const { status, body } = await getDriverFullByCpf(params.cpf)
          set.status = status
          return body
        },
        {
          params: t.Object({ cpf: t.String() }),
          detail: {
            tags: ['integrations'],
            summary: 'Dados completos do motorista por CPF (ranking + torre + cargas, tratado)',
          },
        },
      ),
  )
