import { sql, type SQL } from 'drizzle-orm'
import { db } from '../../db/client'
import { MOTIVOS_TRATATIVA, type MotivoTratativa } from '../../db/schema'
import { logger } from '../../lib/logger'
import { getPendencias } from './manifesto.service'
import { resumoPorManifesto } from './tratativas.service'

/**
 * Relatório de motivos das justificativas de baixa de manifesto.
 *
 * A finalidade está declarada desde a migration (drizzle/manifesto-tratativas.sql: "relatório por
 * período / distribuição de motivos"): depois de a apresentação mostrar 60% dos manifestos com
 * prazo vencido, a pergunta seguinte é "por quê" — e a resposta só existe agregada.
 *
 * Arquivo separado de tratativas.service.ts de propósito: lá é o registro do operador (escrita +
 * leitura por manifesto), importado pela tela crítica; aqui é outro consumidor, com outro SQL.
 *
 * ⚠️ FUSO — o detalhe que muda todos os números. `created_at` é defaultNow(), instante UTC
 * verdadeiro: uma nota às 21:30 de Brasília é 00:30Z do dia seguinte. Filtrar/agrupar em UTC jogaria
 * o turno da noite inteiro para o dia seguinte, todo dia. Por isso o corte é em BRT — convertendo
 * os LIMITES, nunca a coluna: `WHERE created_at >= (limite)::timestamp AT TIME ZONE 'BRT'` mantém o
 * predicado sobre a coluna nua e o índice manifesto_tratativas_created_idx continua sendo usado.
 * Escrever `WHERE (created_at AT TIME ZONE ...)::date BETWEEN ...` mataria o índice.
 *
 * Sem cache: a tabela é pequena (projeção de 15-29 mil linhas/ano, ~3 MB) e a varredura é
 * sub-milissegundo — cachear só criaria janela em que o operador registra e não vê. Divergência
 * consciente do padrão de insights.service.ts, que cacheia porque o SQL lá é caro.
 *
 * NÃO tem quebra por autor (decisão Danilo 13/08): o relatório mora dentro de /baixa-manifesto e o
 * papel `manifesto` é confinado por prefixo de URL, então os 3 operadores o veem. Corte por autor é
 * dado de avaliação de desempenho e, se um dia for preciso, vai para outro lugar com decisão própria.
 */

const BRT = 'America/Sao_Paulo'

/** Acentos → ASCII, para agrupar destino digitado de formas diferentes. Já duplicado em
 * insights.service.ts e exports.service.ts (3ª cópia; candidato a lib/). */
const ACC = "'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç','AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'"

/**
 * Range em horário de Brasília. Converte os LIMITES (ver nota de fuso no topo).
 * Ordena bounds invertidos: sem isso `?inicio=maior&fim=menor` devolveria zero silencioso — e zero
 * silencioso, neste relatório, é lido como "ninguém justificou".
 */
function brtRangeSql(col: SQL, inicio?: string | null, fim?: string | null): SQL {
  let a = inicio || null
  let b = fim || null
  if (a && b && a > b) [a, b] = [b, a]
  const cond: SQL[] = []
  if (a) cond.push(sql`${col} >= (${a} || ' 00:00:00')::timestamp AT TIME ZONE ${BRT}`)
  if (b) cond.push(sql`${col} <= (${b} || ' 23:59:59')::timestamp AT TIME ZONE ${BRT}`)
  return cond.length ? sql.join(cond, sql` AND `) : sql`TRUE`
}

export interface MotivoAgregado {
  motivo: string
  motivo_rotulo: string
  /** false = código que não está mais na lista de motivos (histórico) */
  ativo: boolean
  notas: number
  manifestos: number
}

export interface RelatorioTratativas {
  periodo: { inicio: string | null; fim: string | null }
  total_notas: number
  total_manifestos: number
  por_motivo: MotivoAgregado[]
  serie: { dia: string; total: number }[]
  por_destino: { destino: string; notas: number; manifestos: number }[]
  /** Instantâneo de AGORA (não do período) — quanto do problema está sequer explicado. */
  cobertura: {
    snapshot_em: string | null
    idade_min: number | null
    snapshot_ok: boolean
    abertos: number
    vencidos: number
    vencidos_com_justificativa: number
    vencidos_sem_justificativa: number
    cobertura_pct: number
  } | null
}

function rotuloDe(codigo: string): { rotulo: string; ativo: boolean } {
  if (Object.prototype.hasOwnProperty.call(MOTIVOS_TRATATIVA, codigo)) {
    return { rotulo: MOTIVOS_TRATATIVA[codigo as MotivoTratativa], ativo: true }
  }
  // ⚠️ NÃO coagir para 'outro' como paraRegistro() faz. Ali é para exibir uma nota; aqui fundir um
  // motivo descontinuado dentro de "Outro" reescreveria a história: "Outro" cresceria sem explicação
  // e o motivo aposentado desapareceria como se nunca tivesse ocorrido.
  return { rotulo: `${codigo} (motivo descontinuado)`, ativo: false }
}

/** Preenche dias sem nota com zero: vão vazio viraria linha contínua e esconderia justamente o
 * que interessa — ninguém registrou nada naquele dia. */
function preencherDias(
  linhas: { dia: string; total: number }[],
  inicio: string | null,
  fim: string | null,
): { dia: string; total: number }[] {
  const mapa = new Map(linhas.map((l) => [l.dia, l.total]))
  const primeiro = inicio || linhas[0]?.dia
  const ultimo = fim || linhas[linhas.length - 1]?.dia
  if (!primeiro || !ultimo) return linhas
  const out: { dia: string; total: number }[] = []
  const d = new Date(`${primeiro}T00:00:00Z`)
  const limite = new Date(`${ultimo}T00:00:00Z`)
  // teto de 400 iterações: período absurdo na URL não pode virar laço longo
  for (let i = 0; d <= limite && i < 400; i++) {
    const chave = d.toISOString().slice(0, 10)
    out.push({ dia: chave, total: mapa.get(chave) ?? 0 })
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/**
 * Cobertura de AGORA: dos manifestos com prazo vencido, quantos têm ao menos uma justificativa.
 *
 * É o número que responde à diretoria — sem ele, a distribuição de motivos parece explicar todos os
 * vencidos quando explica só os que alguém justificou. Aditivo: se o snapshot falhar, devolve null e
 * o relatório histórico continua.
 */
async function calcularCobertura(): Promise<RelatorioTratativas['cobertura']> {
  try {
    const view = await getPendencias()
    if (!view.pendencias.length) return null
    const vencidos = view.pendencias.filter(
      (p) => (p.horas_atraso ?? 0) > 0 && typeof p.codman === 'number' && typeof p.filial === 'number',
    )
    const refs = vencidos.map((p) => ({ codman: p.codman!, filial: p.filial!, serie: p.serie }))
    const resumo = refs.length ? await resumoPorManifesto(refs) : {}
    const comJustificativa = refs.filter(
      (r) => resumo[`${r.codman}|${r.filial}|${(r.serie ?? '').trim().slice(0, 10)}`],
    ).length
    return {
      snapshot_em: view.gerado_em,
      idade_min: view.idade_min,
      // mesmo critério de frescor da tela (banner de stale em 15 min)
      snapshot_ok: view.idade_min != null && view.idade_min <= 15,
      abertos: view.pendencias.length,
      vencidos: vencidos.length,
      vencidos_com_justificativa: comJustificativa,
      vencidos_sem_justificativa: vencidos.length - comJustificativa,
      cobertura_pct: vencidos.length ? Math.round((comJustificativa * 100) / vencidos.length) : 0,
    }
  } catch (e: any) {
    logger.error({ error: e?.message ?? String(e) }, '[manifesto] cobertura indisponível no relatório')
    return null
  }
}

export async function relatorioTratativas(
  inicio?: string | null,
  fim?: string | null,
): Promise<RelatorioTratativas> {
  const periodo = brtRangeSql(sql`created_at`, inicio, fim)

  const porMotivo = (await db.execute(sql`
    SELECT motivo,
           COUNT(*) AS notas,
           COUNT(DISTINCT (codman::text || '|' || filial::text || '|' || btrim(serie))) AS manifestos
    FROM manifesto_tratativas
    WHERE (${periodo})
    GROUP BY motivo
    ORDER BY manifestos DESC, notas DESC
  `)) as unknown as Array<{ motivo: string; notas: string | number; manifestos: string | number }>

  const serieBruta = (await db.execute(sql`
    SELECT TO_CHAR((created_at AT TIME ZONE ${BRT})::date, 'YYYY-MM-DD') AS dia,
           COUNT(*) AS total
    FROM manifesto_tratativas
    WHERE (${periodo})
    GROUP BY (created_at AT TIME ZONE ${BRT})::date
    ORDER BY (created_at AT TIME ZONE ${BRT})::date ASC
  `)) as unknown as Array<{ dia: string; total: string | number }>

  const porDestino = (await db.execute(sql`
    SELECT COALESCE(MIN(btrim(destino)), '(não informado)') AS destino,
           COUNT(*) AS notas,
           COUNT(DISTINCT (codman::text || '|' || filial::text || '|' || btrim(serie))) AS manifestos
    FROM manifesto_tratativas
    WHERE (${periodo})
    GROUP BY COALESCE(upper(translate(btrim(destino), ${sql.raw(ACC)})), '(sem destino)')
    ORDER BY manifestos DESC, notas DESC
    LIMIT 10
  `)) as unknown as Array<{ destino: string; notas: string | number; manifestos: string | number }>

  const totais = (await db.execute(sql`
    SELECT COUNT(*) AS notas,
           COUNT(DISTINCT (codman::text || '|' || filial::text || '|' || btrim(serie))) AS manifestos
    FROM manifesto_tratativas
    WHERE (${periodo})
  `)) as unknown as Array<{ notas: string | number; manifestos: string | number }>

  // Completude nos DOIS sentidos: todo motivo ativo aparece (mesmo com 0, para "Documentação: 0" ser
  // zero visível e não categoria ausente) e todo código presente nos dados aparece, mesmo aposentado.
  const vistos = new Map<string, MotivoAgregado>()
  for (const r of porMotivo) {
    const { rotulo, ativo } = rotuloDe(r.motivo)
    vistos.set(r.motivo, {
      motivo: r.motivo, motivo_rotulo: rotulo, ativo,
      notas: Number(r.notas), manifestos: Number(r.manifestos),
    })
  }
  for (const [codigo, rotulo] of Object.entries(MOTIVOS_TRATATIVA)) {
    if (!vistos.has(codigo)) {
      vistos.set(codigo, { motivo: codigo, motivo_rotulo: rotulo, ativo: true, notas: 0, manifestos: 0 })
    }
  }

  return {
    periodo: { inicio: inicio || null, fim: fim || null },
    total_notas: Number(totais[0]?.notas ?? 0),
    total_manifestos: Number(totais[0]?.manifestos ?? 0),
    por_motivo: [...vistos.values()].sort((a, b) => b.manifestos - a.manifestos || b.notas - a.notas),
    serie: preencherDias(
      serieBruta.map((r) => ({ dia: r.dia, total: Number(r.total) })),
      inicio || null,
      fim || null,
    ),
    por_destino: porDestino.map((r) => ({
      destino: r.destino, notas: Number(r.notas), manifestos: Number(r.manifestos),
    })),
    cobertura: await calcularCobertura(),
  }
}
