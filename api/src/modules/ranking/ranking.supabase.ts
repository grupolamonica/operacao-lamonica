import { createClient } from '@supabase/supabase-js'

/**
 * Client Supabase server-side para o projeto EXTERNO do ride-rank
 * (vrlhfgfyjvkzfnafibnc).
 *
 * D-V2-01 (PROXY): toda leitura do ride-rank passa por aqui (server-side).
 * Usa o `service_role` (RANK_SUPABASE_SERVICE_KEY) que BYPASSA o RLS — por isso
 * lê todas as 5 tabelas (evaluations, driver_blocks, evaluation_logs,
 * route_scores, drivers) onde o anon só enxerga `drivers`.
 *
 * SEGURANÇA (T-07-01): o service_role é o segredo mais sensível desta fase.
 * - Lido SÓ de process.env. NUNCA logado (sem console.log do valor).
 * - Nunca prefixado com VITE_ → não chega ao bundle do front.
 * - Sem sessão de browser: persistSession:false / autoRefreshToken:false.
 *
 * NÃO é o client do Torre (api/src/db/client.ts usa Drizzle/postgres.js para o
 * torre-controle-prod). São DBs diferentes — este aponta para o ride-rank.
 */

const RANK_SUPABASE_URL = process.env.RANK_SUPABASE_URL
const RANK_SUPABASE_SERVICE_KEY = process.env.RANK_SUPABASE_SERVICE_KEY

// Fail-fast no module-load (mesmo padrão do redis/client.ts).
// NUNCA logar o valor da key — só a ausência.
if (!RANK_SUPABASE_URL) {
  throw new Error('RANK_SUPABASE_URL is not defined')
}
if (!RANK_SUPABASE_SERVICE_KEY) {
  throw new Error('RANK_SUPABASE_SERVICE_KEY is not defined')
}

export const rankSupabase = createClient(RANK_SUPABASE_URL, RANK_SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

export type RankSupabase = typeof rankSupabase
