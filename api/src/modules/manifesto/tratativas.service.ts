import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import { manifestoTratativas, MOTIVOS_TRATATIVA, users, type MotivoTratativa } from '../../db/schema'
import { logger } from '../../lib/logger'

/**
 * Tratativas de baixa de manifesto — a justificativa que o operador escreve.
 *
 * Fica separado de manifesto.service.ts de propósito: lá é o snapshot VOLÁTIL do
 * coletor (Redis, sobrescrito a cada 5 min); aqui é o registro PERMANENTE do operador
 * (Postgres). A nota sobrevive à baixa do manifesto — quando ele sai da tela, a linha
 * continua aqui e alimenta o relatório de por que a baixa demorou.
 *
 * Append-only (decisão Danilo 12/08): não há update nem delete. Correção se faz
 * escrevendo nota nova; o histórico é a auditoria.
 */

export interface NovaTratativa {
  codman: number
  filial: number
  serie?: string | null
  placa?: string | null
  destino?: string | null
  motivo: string
  notes?: string | null
  operatorId: string | null
  authorName: string | null
}

export interface TratativaRegistro {
  id: string
  motivo: MotivoTratativa
  motivo_rotulo: string
  notes: string | null
  autor: string | null
  criado_em: string
}

export interface ResumoTratativa {
  total: number
  ultima: TratativaRegistro
}

/**
 * Normaliza a série ANTES de qualquer uso — gravação, leitura e chave.
 *
 * Tem que ser exatamente a mesma transformação nos três lugares: a série faz parte da
 * chave, então truncar na gravação e não na leitura (ou vice-versa) faria a nota existir
 * no banco e nunca aparecer na tela. slice no tamanho da coluna varchar(10) para o insert
 * nunca estourar; '' quando ausente, porque NULL não casa com NULL em comparação.
 * O front espelha isto em chaveTratativa() (useManifestoPendencias.ts).
 */
export function normalizarSerie(serie?: string | null): string {
  return (serie ?? '').trim().slice(0, 10)
}

/** Chave natural do manifesto no Rodopar. */
export function chaveManifesto(codman: number, filial: number, serie?: string | null): string {
  return `${codman}|${filial}|${normalizarSerie(serie)}`
}

export function motivoValido(motivo: string): motivo is MotivoTratativa {
  return Object.prototype.hasOwnProperty.call(MOTIVOS_TRATATIVA, motivo)
}

function paraRegistro(row: typeof manifestoTratativas.$inferSelect): TratativaRegistro {
  const motivo = (motivoValido(row.motivo) ? row.motivo : 'outro') as MotivoTratativa
  return {
    id: row.id,
    motivo,
    motivo_rotulo: MOTIVOS_TRATATIVA[motivo],
    notes: row.notes ?? null,
    autor: row.authorName ?? null,
    criado_em: row.createdAt.toISOString(),
  }
}

export async function registrarTratativa(input: NovaTratativa): Promise<TratativaRegistro> {
  // O JWT carrega só { id, role, jti } — não o nome. Buscamos aqui em vez de confiar no
  // corpo do request: quem assina a nota é quem está logado, não quem o cliente disser.
  let authorName = input.authorName
  if (!authorName && input.operatorId) {
    const [u] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, input.operatorId))
      .limit(1)
    authorName = u?.name ?? null
  }

  const [row] = await db
    .insert(manifestoTratativas)
    .values({
      codman: input.codman,
      filial: input.filial,
      serie: normalizarSerie(input.serie),
      // truncados no limite da coluna: o snapshot pode trazer destino longo e um insert
      // que estoura varchar derrubaria o registro da justificativa por um detalhe de texto
      placa: input.placa?.slice(0, 10) ?? null,
      destino: input.destino?.slice(0, 120) ?? null,
      motivo: input.motivo,
      notes: input.notes?.trim() || null,
      operatorId: input.operatorId,
      authorName: authorName?.slice(0, 120) ?? null,
    })
    .returning()
  logger.info(
    { codman: input.codman, filial: input.filial, motivo: input.motivo, autor: authorName },
    '[manifesto] tratativa registrada',
  )
  return paraRegistro(row)
}

/**
 * Resumo por manifesto para a tela: total de notas + a mais recente.
 *
 * Busca por `codman IN (...)` (usa o índice) e filtra filial/série em memória — a chave
 * é composta e o IN de tupla não é portável no Drizzle. A lista do snapshot tem ~80 itens.
 */
export async function resumoPorManifesto(
  refs: { codman: number; filial: number; serie?: string | null }[],
): Promise<Record<string, ResumoTratativa>> {
  const codmans = [...new Set(refs.map((r) => r.codman))].filter((c) => Number.isFinite(c))
  if (!codmans.length) return {}

  const rows = await db
    .select()
    .from(manifestoTratativas)
    .where(inArray(manifestoTratativas.codman, codmans))
    .orderBy(desc(manifestoTratativas.createdAt))

  // só as chaves pedidas: codman pode repetir entre filiais/séries diferentes
  const pedidas = new Set(refs.map((r) => chaveManifesto(r.codman, r.filial, r.serie)))
  const out: Record<string, ResumoTratativa> = {}
  for (const row of rows) {
    const chave = chaveManifesto(row.codman, row.filial, row.serie)
    if (!pedidas.has(chave)) continue
    const atual = out[chave]
    if (atual) {
      atual.total += 1        // já ordenado por createdAt desc → a 1ª vista é a última nota
      continue
    }
    out[chave] = { total: 1, ultima: paraRegistro(row) }
  }
  return out
}

/** Histórico completo de um manifesto (painel de detalhes), mais recente primeiro. */
export async function historicoManifesto(
  codman: number,
  filial: number,
  serie?: string | null,
): Promise<TratativaRegistro[]> {
  const rows = await db
    .select()
    .from(manifestoTratativas)
    .where(
      and(
        eq(manifestoTratativas.codman, codman),
        eq(manifestoTratativas.filial, filial),
        eq(manifestoTratativas.serie, normalizarSerie(serie)),
      ),
    )
    .orderBy(desc(manifestoTratativas.createdAt))
  return rows.map(paraRegistro)
}
