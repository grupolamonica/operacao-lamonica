/**
 * Write-back de alocação no sistema de Cargas (D-14-05/06).
 *
 * Fluxo: sign-in no Supabase Auth do Cargas (grant_type=password, conta de
 * operador `advanced`) → access_token → Bearer nos endpoints HTTP de operador.
 *
 * Dois caminhos:
 *  (a) candidato QUEUED existente → POST /api/loads/:loadId/leads/:leadId/approve
 *  (b) motorista avulso          → POST /api/operator/loads/:loadId/direct-allocation
 *
 * GATED: só executa quando CARGAS_WRITE_ENABLED === 'true'. Com a flag off, o
 * plugin nem chama estas funções (retorna 501) — nenhuma escrita em produção
 * acontece sem o flip explícito. Credenciais SÓ de process.env, nunca logadas.
 */

import type { AllocateInput } from './cargas.types'

export function isCargasWriteEnabled(): boolean {
  return process.env.CARGAS_WRITE_ENABLED === 'true'
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not defined`)
  return v
}

/** Sign-in do operador no Supabase Auth do Cargas → access_token (JWT de usuário). */
async function signInOperator(): Promise<string> {
  const url = requireEnv('CARGAS_SUPABASE_URL')
  const apikey = requireEnv('CARGAS_SUPABASE_KEY')
  const email = requireEnv('CARGAS_OPERATOR_EMAIL')
  const password = requireEnv('CARGAS_OPERATOR_PASSWORD')

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error(`Cargas operator sign-in failed (${res.status})`)
  }
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('Cargas sign-in returned no access_token')
  return json.access_token
}

function operatorHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Correlation-Id': crypto.randomUUID(),
    'Idempotency-Key': crypto.randomUUID(),
  }
}

/**
 * Aloca um motorista a uma carga aberta no Cargas. Escolhe o caminho conforme o
 * input: `leadId` → approve; senão → direct-allocation com os dados do motorista.
 */
export async function allocateLoad(loadId: string, input: AllocateInput): Promise<unknown> {
  if (!isCargasWriteEnabled()) {
    throw new Error('CARGAS_WRITE_ENABLED is false — alocação desabilitada')
  }
  const apiUrl = requireEnv('CARGAS_API_URL')
  const token = await signInOperator()
  const headers = operatorHeaders(token)

  let endpoint: string
  let body: string | undefined
  if (input.leadId) {
    // (a) aprovar lead QUEUED existente
    endpoint = `${apiUrl}/api/loads/${loadId}/leads/${input.leadId}/approve`
    body = undefined
  } else {
    // (b) alocação direta de motorista avulso (cria lead + reserva)
    endpoint = `${apiUrl}/api/operator/loads/${loadId}/direct-allocation`
    body = JSON.stringify({
      cpf: input.cpf,
      phone: input.phone,
      horsePlate: input.horsePlate,
      trailerPlate: input.trailerPlate,
      trailerPlate2: input.trailerPlate2,
      vehicleType: input.vehicleType,
    })
  }

  const res = await fetch(endpoint, { method: 'POST', headers, body })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Cargas allocation failed (${res.status}): ${text.slice(0, 300)}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    return { ok: true, raw: text }
  }
}
