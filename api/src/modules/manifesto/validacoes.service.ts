import { desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { manifestoValidacoes, MOTIVOS_ERRO, users, type MotivoErro } from '../../db/schema'
import { logger } from '../../lib/logger'
import { chaveManifesto, normalizarSerie } from './tratativas.service'

/**
 * Validação do sistema pelo operador — ver drizzle/manifesto-validacoes.sql para o "por quê".
 *
 * Cada validação carrega a FOTO do que o sistema dizia no instante (estado, origem do sinal,
 * evidências). É isso que torna a acurácia calculável: o snapshot é sobrescrito a cada 5 min e
 * depois não há como saber o que o operador viu.
 */

export interface NovaValidacao {
  codman: number
  filial: number
  serie?: string | null
  // a foto do momento, vinda do próprio snapshot que o operador tinha na tela
  estadoSistema: string
  origemEstado?: string | null
  evidencias?: string[] | null
  comprovacaoTrava?: boolean | null
  naFrota?: boolean | null
  estadoDesde?: string | null
  // o veredito
  veredito: 'correto' | 'incorreto'
  motivoErro?: string | null
  observacao?: string | null
  /** true quando o operador declarou ter baixado — grava o instante do clique */
  baixou?: boolean
  placa?: string | null
  destino?: string | null
  operatorId: string | null
}

export interface ValidacaoRegistro {
  id: string
  estado_sistema: string
  origem_estado: string | null
  veredito: string
  motivo_erro: string | null
  motivo_erro_rotulo: string | null
  observacao: string | null
  baixado_em: string | null
  autor: string | null
  criado_em: string
  /** horas entre o sistema entrar no estado e o operador declarar a baixa (null se não deu) */
  horas_ate_baixa: number | null
}

export function motivoErroValido(motivo: string): motivo is MotivoErro {
  return Object.prototype.hasOwnProperty.call(MOTIVOS_ERRO, motivo)
}

function paraRegistro(row: typeof manifestoValidacoes.$inferSelect): ValidacaoRegistro {
  const rotulo = row.motivoErro && motivoErroValido(row.motivoErro)
    ? MOTIVOS_ERRO[row.motivoErro]
    : row.motivoErro
  let horas: number | null = null
  if (row.baixadoEm && row.estadoDesde) {
    horas = Math.round(((row.baixadoEm.getTime() - row.estadoDesde.getTime()) / 3_600_000) * 10) / 10
  }
  return {
    id: row.id,
    estado_sistema: row.estadoSistema,
    origem_estado: row.origemEstado ?? null,
    veredito: row.veredito,
    motivo_erro: row.motivoErro ?? null,
    motivo_erro_rotulo: rotulo ?? null,
    observacao: row.observacao ?? null,
    baixado_em: row.baixadoEm?.toISOString() ?? null,
    autor: row.authorName ?? null,
    criado_em: row.createdAt.toISOString(),
    horas_ate_baixa: horas,
  }
}

async function nomeDoOperador(operatorId: string | null): Promise<string | null> {
  if (!operatorId) return null
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, operatorId)).limit(1)
  return u?.name ?? null
}

/**
 * `estado_desde` vem do coletor como wall-clock local sem fuso (ex.: 2026-08-13T14:02:11) — o
 * mesmo idioma de todos os campos *_local do snapshot. Interpretar com `new Date(str)` usaria o
 * fuso do servidor; como o coletor e o Postgres operam no mesmo horário de Brasília, anexamos o
 * offset explicitamente para o timestamptz gravar o instante certo.
 */
function paraTimestamp(local?: string | null): Date | null {
  if (!local) return null
  const d = new Date(/[Z+]|-\d{2}:\d{2}$/.test(local) ? local : `${local}-03:00`)
  return isNaN(d.getTime()) ? null : d
}

export async function registrarValidacao(input: NovaValidacao): Promise<ValidacaoRegistro> {
  const autor = await nomeDoOperador(input.operatorId)
  const [row] = await db
    .insert(manifestoValidacoes)
    .values({
      codman: input.codman,
      filial: input.filial,
      serie: normalizarSerie(input.serie),
      estadoSistema: input.estadoSistema.slice(0, 30),
      origemEstado: input.origemEstado?.slice(0, 10) ?? null,
      // guardado como texto simples: é auditoria do que fundamentou o estado, não campo de query
      evidencias: (input.evidencias ?? []).join(',').slice(0, 500) || null,
      comprovacaoTrava: input.comprovacaoTrava ?? null,
      naFrota: input.naFrota ?? null,
      estadoDesde: paraTimestamp(input.estadoDesde),
      veredito: input.veredito,
      motivoErro: input.veredito === 'incorreto' ? (input.motivoErro ?? null) : null,
      observacao: input.observacao?.trim() || null,
      // só o "baixei" marca instante; negar não é baixa
      baixadoEm: input.baixou && input.veredito === 'correto' ? new Date() : null,
      placa: input.placa?.slice(0, 10) ?? null,
      destino: input.destino?.slice(0, 120) ?? null,
      operatorId: input.operatorId,
      authorName: autor,
    })
    .returning()

  logger.info(
    {
      codman: input.codman, veredito: input.veredito,
      estado: input.estadoSistema, origem: input.origemEstado, autor,
    },
    '[manifesto] validação registrada',
  )
  return paraRegistro(row)
}

/** Última validação de cada manifesto pedido — a tela usa para marcar o que já foi validado. */
export async function validacoesPorManifesto(
  refs: { codman: number; filial: number; serie?: string | null }[],
): Promise<Record<string, ValidacaoRegistro>> {
  const codmans = [...new Set(refs.map((r) => r.codman))].filter((c) => Number.isFinite(c))
  if (!codmans.length) return {}

  const rows = await db
    .select()
    .from(manifestoValidacoes)
    .where(inArray(manifestoValidacoes.codman, codmans))
    .orderBy(desc(manifestoValidacoes.createdAt))

  const pedidas = new Set(refs.map((r) => chaveManifesto(r.codman, r.filial, r.serie)))
  const out: Record<string, ValidacaoRegistro> = {}
  for (const row of rows) {
    const chave = chaveManifesto(row.codman, row.filial, row.serie)
    // já ordenado desc: a primeira vista de cada chave é a mais recente
    if (pedidas.has(chave) && !out[chave]) out[chave] = paraRegistro(row)
  }
  return out
}

export interface AcuraciaSistema {
  periodo_dias: number
  total: number
  /** validações sobre itens que o sistema apontou como descarregado — a base da precisão */
  alertas_validados: number
  alertas_corretos: number
  precisao_pct: number | null
  /** margem aproximada (95%) da precisão, em pontos percentuais — honesta sobre amostra pequena */
  margem_pp: number | null
  /** operador discordou de item NÃO alertado: indício de conservadorismo, não recall */
  falsos_negativos: number
  por_origem: { origem: string; total: number; corretos: number; precisao_pct: number }[]
  por_motivo_erro: { motivo: string; motivo_rotulo: string; total: number }[]
  /** morosidade: horas entre o sistema alertar e o operador declarar a baixa */
  baixas_declaradas: number
  horas_ate_baixa_media: number | null
  horas_ate_baixa_mediana: number | null
}

/**
 * Acurácia do sistema no período.
 *
 * A precisão só considera validações de itens que o sistema apontou como DESCARREGADO — é a
 * pergunta "do que ele apitou, quanto estava certo". Validação de item em outro estado entra em
 * `falsos_negativos` e é tratada como INDÍCIO, não medida: ela só existe quando alguém por acaso
 * abriu um manifesto não-alertado e discordou. Chamar isso de recall seria mentir.
 *
 * A margem usa a aproximação normal (1,96·√(p(1-p)/n)) — grosseira para n pequeno, mas suficiente
 * para a tela deixar claro quando ainda não há amostra para afirmar nada.
 */
export async function acuraciaSistema(dias = 30): Promise<AcuraciaSistema> {
  const janela = Math.min(Math.max(dias, 1), 365)
  const rows = await db
    .select()
    .from(manifestoValidacoes)
    .where(sql`${manifestoValidacoes.createdAt} >= now() - (${janela} || ' days')::interval`)
    .orderBy(desc(manifestoValidacoes.createdAt))

  const alertas = rows.filter((r) => r.estadoSistema === 'descarregado')
  const corretos = alertas.filter((r) => r.veredito === 'correto')
  const n = alertas.length
  const p = n ? corretos.length / n : null
  const margem = p != null && n ? Math.round(1.96 * Math.sqrt((p * (1 - p)) / n) * 1000) / 10 : null

  const porOrigem = new Map<string, { total: number; corretos: number }>()
  for (const r of alertas) {
    const k = r.origemEstado || '(sem origem)'
    const acc = porOrigem.get(k) ?? { total: 0, corretos: 0 }
    acc.total += 1
    if (r.veredito === 'correto') acc.corretos += 1
    porOrigem.set(k, acc)
  }

  const porMotivo = new Map<string, number>()
  for (const r of rows) {
    if (r.veredito === 'incorreto' && r.motivoErro) {
      porMotivo.set(r.motivoErro, (porMotivo.get(r.motivoErro) ?? 0) + 1)
    }
  }

  const horas = rows
    .map((r) => paraRegistro(r).horas_ate_baixa)
    .filter((h): h is number => h != null)
    .sort((a, b) => a - b)
  const media = horas.length
    ? Math.round((horas.reduce((s, h) => s + h, 0) / horas.length) * 10) / 10
    : null
  const mediana = horas.length
    ? horas.length % 2
      ? horas[(horas.length - 1) / 2]
      : Math.round(((horas[horas.length / 2 - 1] + horas[horas.length / 2]) / 2) * 10) / 10
    : null

  return {
    periodo_dias: janela,
    total: rows.length,
    alertas_validados: n,
    alertas_corretos: corretos.length,
    precisao_pct: p == null ? null : Math.round(p * 1000) / 10,
    margem_pp: margem,
    falsos_negativos: rows.filter((r) => r.estadoSistema !== 'descarregado' && r.veredito === 'incorreto').length,
    por_origem: [...porOrigem.entries()]
      .map(([origem, v]) => ({
        origem, total: v.total, corretos: v.corretos,
        precisao_pct: Math.round((v.corretos / v.total) * 1000) / 10,
      }))
      .sort((a, b) => b.total - a.total),
    por_motivo_erro: [...porMotivo.entries()]
      .map(([motivo, total]) => ({
        motivo,
        motivo_rotulo: motivoErroValido(motivo) ? MOTIVOS_ERRO[motivo] : motivo,
        total,
      }))
      .sort((a, b) => b.total - a.total),
    baixas_declaradas: horas.length,
    horas_ate_baixa_media: media,
    horas_ate_baixa_mediana: mediana,
  }
}
