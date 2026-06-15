import { sql, type SQL } from 'drizzle-orm'

/**
 * Filtro de Prazo Final por intervalo de datas — réplica do checkVisibilityDate()
 * do painel HTML: prazo >= início(00:00) e prazo <= fim(23:59:59). Sem datas = sem
 * corte (TRUE).
 *
 * Convenção dos timestamps das viagens (window_end/eta vindos do painel): o
 * relógio-de-parede de Brasília é gravado como se fosse UTC (painel-sync insere a
 * string sem offset numa sessão UTC; o front exibe via UTC-getters). Logo os bounds
 * do dia-calendário são ancorados em UTC (NÃO America/Sao_Paulo — isso deslocaria −3h).
 *
 * @param col   coluna de data (normalmente o Prazo Final = trips.window_end)
 * @param inicio 'YYYY-MM-DD' | null
 * @param fim    'YYYY-MM-DD' | null
 */
export function prazoRangeSql(col: SQL, inicio?: string | null, fim?: string | null): SQL {
  // guard: intervalo invertido (ex.: URL manual) → ordena, evita resultado vazio silencioso
  if (inicio && fim && inicio > fim) [inicio, fim] = [fim, inicio]
  const conds: SQL[] = []
  if (inicio) conds.push(sql`${col} >= (${inicio} || ' 00:00:00')::timestamp AT TIME ZONE 'UTC'`)
  if (fim)    conds.push(sql`${col} <= (${fim}    || ' 23:59:59')::timestamp AT TIME ZONE 'UTC'`)
  return conds.length ? sql.join(conds, sql` AND `) : sql`TRUE`
}
