import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Client Supabase server-side para o sistema de Cargas (Lamonica).
 *
 * D-14-01 (PROXY): a Torre LÊ o Cargas server-side, mesmo padrão do ranking
 * (ver ranking.supabase.ts), via CARGAS_SUPABASE_URL + a service_role key
 * (CARGAS_SUPABASE_KEY).
 *
 * ⚠️ ESTE COMENTÁRIO JÁ MENTIU. Ele dizia "aponta para o projeto de TESTE
 * `oklksqvrexiypectfsod`" — verdade quando foi escrito, e falso desde alguma
 * troca de secret que ninguém anotou. Conferido no `.env` da VPS em 28/08/2026:
 * o valor real é `lbpzkdecwraipbjbaajs`, o projeto de PRODUÇÃO do Cargas, o
 * mesmo que o backend de lá usa.
 *
 * Isso importa muito mais do que parece: a baixa automática de manifesto
 * (baixa-auto.fontes.ts) lê `nestle_ofertas`/`nestle_embarques` POR AQUI para
 * decidir se um manifesto pode ser fechado no ERP. Ler o banco errado seria
 * decidir sobre dados que não são os da operação.
 *
 * O project-ref vive num secret e pode mudar de novo sem que este arquivo saiba.
 * Por isso a defesa NÃO é este comentário: é o portão de frescor do leitor, que
 * fecha sozinho se os dados estiverem parados. Comentário apodrece; portão não.
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
