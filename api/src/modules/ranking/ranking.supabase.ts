import { createClient } from '@supabase/supabase-js'

/**
 * Client Supabase server-side para o projeto de ranking "Lamonica Ranking"
 * (qbwazymqhfunlhnikbla, sa-east-1).
 *
 * D-V2-01 (PROXY): toda leitura do ranking passa por aqui (server-side); o front
 * consome /api/ranking/* via cookie do Torre.
 * Key via RANK_SUPABASE_SERVICE_KEY: o RLS do projeto LIBERA leitura para o anon
 * nas 5 tabelas (evaluations, driver_blocks, evaluation_logs, route_scores,
 * drivers), então a ANON/publishable key basta para a Phase 7 (read-only).
 *
 * SEGURANÇA (T-07-01): a key é lida SÓ de process.env, NUNCA logada (sem
 * console.log do valor), nunca prefixada com VITE_ (não chega ao bundle do
 * front). Sem sessão de browser: persistSession:false / autoRefreshToken:false.
 *
 * NÃO é o client do Torre (api/src/db/client.ts usa Drizzle/postgres.js para o
 * torre-controle-prod). São DBs diferentes — este aponta para o ride-rank.
 *
 * LAZY-INIT (07-04): a validação fail-fast acontece na PRIMEIRA query
 * (`getRankSupabase()`), não no module-load. Motivos:
 *   - o pipeline de composição (ranking.service) é PURO e testável (composeRanking)
 *     sem credencial — um fail-fast no import quebraria o `bun test` da composição,
 *     que importa a árvore do módulo transitivamente (via ranking.reads);
 *   - o boot da API e o smoke 401-sem-auth funcionam SEM a key real: o `authGuard`
 *     barra a request antes de qualquer query, então o client nunca é criado.
 * A mensagem/severidade do fail-fast é preservada — só muda o MOMENTO (1º uso real,
 * não import). A `RANK_SUPABASE_SERVICE_KEY` real continua sendo prereq para
 * SERVIR dados (checkpoint de paridade do 07-04).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Returns the singleton ride-rank Supabase client, creating it on first use.
 * Throws (same fail-fast as before) if the RANK_* envs are missing — but only
 * when a query is actually attempted, never at import time.
 */
export function getRankSupabase(): SupabaseClient {
  if (_client) return _client

  const RANK_SUPABASE_URL = process.env.RANK_SUPABASE_URL
  const RANK_SUPABASE_SERVICE_KEY = process.env.RANK_SUPABASE_SERVICE_KEY

  // NUNCA logar o valor da key — só a ausência.
  if (!RANK_SUPABASE_URL) {
    throw new Error('RANK_SUPABASE_URL is not defined')
  }
  if (!RANK_SUPABASE_SERVICE_KEY) {
    throw new Error('RANK_SUPABASE_SERVICE_KEY is not defined')
  }

  _client = createClient(RANK_SUPABASE_URL, RANK_SUPABASE_SERVICE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  return _client
}

/**
 * Lazy proxy that preserves the original `rankSupabase.from(...)` call site
 * (used by ranking.reads). The underlying client is created on first property
 * access via `getRankSupabase()` — so importing this module is side-effect-free.
 */
export const rankSupabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getRankSupabase()
    const value = Reflect.get(client as object, prop, receiver)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

export type RankSupabase = SupabaseClient
