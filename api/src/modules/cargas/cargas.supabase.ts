import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Client Supabase server-side para o sistema de Cargas (Lamonica).
 *
 * D-14-01 (PROXY): a Torre LÊ o Cargas server-side, mesmo padrão do ranking
 * (ver ranking.supabase.ts). Por enquanto aponta para o projeto de TESTE
 * `oklksqvrexiypectfsod` (CARGAS_SUPABASE_URL) com a service_role key
 * (CARGAS_SUPABASE_KEY) — o backend do Cargas usa esse mesmo projeto no setup
 * de teste, então leitura e auth do operador ficam no mesmo lugar.
 *
 * SEGURANÇA: a key é lida SÓ de process.env, NUNCA logada, nunca prefixada com
 * VITE_ (não chega ao bundle). Sem sessão de browser.
 *
 * LAZY-INIT: a validação fail-fast acontece na PRIMEIRA query, não no import —
 * assim o boot da API e os testes puros não exigem a credencial. O `authGuard`
 * do plugin barra requests sem sessão antes de qualquer query.
 */

let _client: SupabaseClient | null = null

export function getCargasSupabase(): SupabaseClient {
  if (_client) return _client

  const CARGAS_SUPABASE_URL = process.env.CARGAS_SUPABASE_URL
  const CARGAS_SUPABASE_KEY = process.env.CARGAS_SUPABASE_KEY

  if (!CARGAS_SUPABASE_URL) {
    throw new Error('CARGAS_SUPABASE_URL is not defined')
  }
  if (!CARGAS_SUPABASE_KEY) {
    throw new Error('CARGAS_SUPABASE_KEY is not defined')
  }

  _client = createClient(CARGAS_SUPABASE_URL, CARGAS_SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  return _client
}

/** Proxy lazy preservando o call-site `cargasSupabase.from(...)`. */
export const cargasSupabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getCargasSupabase()
    const value = Reflect.get(client as object, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

export type CargasSupabase = SupabaseClient
