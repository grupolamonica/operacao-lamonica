import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  manifestoMotoristaFones,
  manifestoMotoristaFoneEventos,
  users,
} from '../../db/schema'
import { logger } from '../../lib/logger'

/**
 * Telefones do motorista gerenciados pelo operador.
 *
 * Separado de tratativas.service.ts de propósito: outro assunto, outra chave natural. Ver
 * drizzle/manifesto-motorista-fones.sql para o "por quê" da modelagem.
 *
 * Estado (nao_funciona) numa linha + trilha de eventos na mesma transação — molde de
 * gr_row_override/gr_override_events. Não é append-only como a justificativa: aqui existe estado
 * que a tela lê a cada 30 s, e o desfazer precisa deixar rastro.
 */

// ─────────────────────────────────────────────────────────── normalização

/**
 * CODMOT do Rodopar em forma canônica. ESPELHADO no front (useManifestoPendencias.ts).
 *
 * Pode chegar como número, ou como char com padding, ou com zeros à esquerda — '001234' e
 * '1234' são o MESMO motorista e precisam casar na chave. '' e '0' são inválidos: gravar linha
 * com codmot vazio criaria um "motorista fantasma" coletivo, juntando telefone de gente diferente.
 */
export function normalizarCodmot(valor?: string | number | null): string {
  const s = String(valor ?? '').trim()
  if (!s) return ''
  const limpo = /^\d+$/.test(s) ? s.replace(/^0+/, '') : s
  if (!limpo || limpo === '0') return ''
  return limpo.slice(0, 20)
}

/**
 * Telefone BR em forma canônica: DDD + número, sem +55 e sem o zero do DDD.
 * ESPELHADO no front em lib/telefone.ts — se as duas divergirem, o número que o operador
 * cadastra não casa com o do Rodopar e o MESMO telefone aparece duas vezes na tela (um riscado,
 * outro não). Mesmo contrato de normalizarSerie/chaveTratativa.
 *
 * ⚠️ A ORDEM IMPORTA: cortar o país ANTES do zero do DDD. O DDD 55 existe (Santa Maria/RS), então
 * '55999998888' (11 dígitos) é um celular de lá e NÃO pode perder o 55; já '5555999998888' (13)
 * é o mesmo número com país. Por isso o corte do '55' exige comprimento 12 ou 13.
 */
export function digitosFone(numero?: string | null): string {
  let d = String(numero ?? '').replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    d = d.slice(2)
  } else if (d.startsWith('0') && (d.length === 11 || d.length === 12)) {
    d = d.replace(/^0+/, '')
  }
  return d.slice(0, 20)
}

/** Só 10 (fixo) ou 11 (celular) dígitos formam DDD + número discável. */
export function foneValido(digitos: string): boolean {
  return digitos.length === 10 || digitos.length === 11
}

// ─────────────────────────────────────────────────────────────── tipos

export interface FoneMotoristaRegistro {
  digitos: string
  numero: string
  rotulo: string
  origem: string
  nao_funciona: boolean
  criado_por: string | null
  criado_em: string
  atualizado_por: string | null
  atualizado_em: string
}

function paraRegistro(row: typeof manifestoMotoristaFones.$inferSelect): FoneMotoristaRegistro {
  return {
    digitos: row.foneDigitos,
    numero: row.numero,
    rotulo: row.rotulo,
    origem: row.origem,
    nao_funciona: row.naoFunciona,
    criado_por: row.createdByName ?? null,
    criado_em: row.createdAt.toISOString(),
    atualizado_por: row.updatedByName ?? null,
    atualizado_em: row.updatedAt.toISOString(),
  }
}

/**
 * Nome de quem está logado, resolvido NO SERVIDOR pelo id do JWT (que só carrega
 * { id, role, jti }). Nunca vem do corpo do request — quem assina é quem está logado.
 * Mesma abordagem de registrarTratativa.
 */
async function nomeDoOperador(operatorId: string | null): Promise<string | null> {
  if (!operatorId) return null
  const [u] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, operatorId))
    .limit(1)
  return u?.name ?? null
}

// ───────────────────────────────────────────────────────────── leitura

/**
 * Telefones por motorista, para a tela cruzar com os números do snapshot.
 *
 * inArray (não `= ANY(array)`, que quebra neste caminho) — mesmo padrão de resumoPorManifesto,
 * já em produção. São ~87 codmots por request, cobertos pelo índice único (codmot é a 1ª coluna).
 * Ordem estável por created_at para os números extras aparecerem sempre na mesma sequência.
 */
export async function fonesPorMotorista(
  codmots: string[],
): Promise<Record<string, FoneMotoristaRegistro[]>> {
  const chaves = [...new Set(codmots.map(normalizarCodmot).filter(Boolean))]
  if (!chaves.length) return {}

  const rows = await db
    .select()
    .from(manifestoMotoristaFones)
    .where(inArray(manifestoMotoristaFones.codmot, chaves))
    .orderBy(asc(manifestoMotoristaFones.createdAt))

  const out: Record<string, FoneMotoristaRegistro[]> = {}
  for (const row of rows) {
    ;(out[row.codmot] ??= []).push(paraRegistro(row))
  }
  return out
}

// ───────────────────────────────────────────────────────────── escrita

export interface NovoFone {
  codmot: string
  numero: string
  rotulo?: string | null
  motoristaNome?: string | null
  operatorId: string | null
}

/**
 * Cadastra um número para o motorista. Idempotente: se o número já existe (mesmo digitado em
 * outro formato), devolve o existente com jaExistia=true.
 *
 * ⚠️ NÃO altera `nao_funciona` de um registro existente: re-adicionar um número riscado não
 * desrisca em silêncio — a intenção de quem marcou tem que ser desfeita explicitamente. A UI
 * aponta o botão Desfazer nesse caso.
 */
export async function adicionarFone(
  input: NovoFone,
): Promise<{ fone: FoneMotoristaRegistro; jaExistia: boolean }> {
  const codmot = normalizarCodmot(input.codmot)
  const digitos = digitosFone(input.numero)
  const autor = await nomeDoOperador(input.operatorId)

  return db.transaction(async (tx) => {
    const criadas = await tx
      .insert(manifestoMotoristaFones)
      .values({
        codmot,
        foneDigitos: digitos,
        numero: input.numero.trim().slice(0, 40),
        rotulo: (input.rotulo || 'Celular').slice(0, 40),
        origem: 'operador',
        motoristaNome: input.motoristaNome?.slice(0, 120) ?? null,
        createdBy: input.operatorId,
        createdByName: autor,
        updatedBy: input.operatorId,
        updatedByName: autor,
      })
      .onConflictDoNothing({
        target: [manifestoMotoristaFones.codmot, manifestoMotoristaFones.foneDigitos],
      })
      .returning()

    if (!criadas.length) {
      const [existente] = await tx
        .select()
        .from(manifestoMotoristaFones)
        .where(
          and(
            eq(manifestoMotoristaFones.codmot, codmot),
            eq(manifestoMotoristaFones.foneDigitos, digitos),
          ),
        )
        .limit(1)
      return { fone: paraRegistro(existente), jaExistia: true }
    }

    await tx.insert(manifestoMotoristaFoneEventos).values({
      codmot,
      foneDigitos: digitos,
      acao: 'criou',
      numero: criadas[0].numero,
      rotulo: criadas[0].rotulo,
      origem: 'operador',
      operatorId: input.operatorId,
      authorName: autor,
    })

    // sem o número no log: é dado pessoal do motorista
    logger.info({ codmot, acao: 'criou', digitos: digitos.length }, '[manifesto] telefone cadastrado')
    return { fone: paraRegistro(criadas[0]), jaExistia: false }
  })
}

export interface MarcaFone {
  codmot: string
  numero: string
  naoFunciona: boolean
  rotulo?: string | null
  motoristaNome?: string | null
  operatorId: string | null
}

/**
 * Liga/desliga o "não funciona" — o riscado da tela.
 *
 * Serve os dois casos num só caminho: se o número veio do Rodopar (não há linha nossa), a linha
 * NASCE aqui com origem='rodopar', existindo apenas para carregar a marca; se é um número que o
 * operador cadastrou, apenas atualiza.
 *
 * ⚠️ O DO UPDATE toca SÓ nao_funciona e os campos de atualização. Incluir origem/numero/rotulo/
 * created_* rebatizaria um número do operador como 'rodopar' e apagaria a autoria do cadastro.
 */
export async function marcarFone(input: MarcaFone): Promise<FoneMotoristaRegistro> {
  const codmot = normalizarCodmot(input.codmot)
  const digitos = digitosFone(input.numero)
  const autor = await nomeDoOperador(input.operatorId)

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(manifestoMotoristaFones)
      .values({
        codmot,
        foneDigitos: digitos,
        numero: input.numero.trim().slice(0, 40),
        rotulo: (input.rotulo || 'Celular').slice(0, 40),
        // só chega aqui sem linha própria quando o número veio do snapshot do Rodopar
        origem: 'rodopar',
        naoFunciona: input.naoFunciona,
        motoristaNome: input.motoristaNome?.slice(0, 120) ?? null,
        createdBy: input.operatorId,
        createdByName: autor,
        updatedBy: input.operatorId,
        updatedByName: autor,
      })
      .onConflictDoUpdate({
        target: [manifestoMotoristaFones.codmot, manifestoMotoristaFones.foneDigitos],
        set: {
          naoFunciona: input.naoFunciona,
          updatedBy: input.operatorId,
          updatedByName: autor,
          updatedAt: new Date(),
        },
      })
      .returning()

    await tx.insert(manifestoMotoristaFoneEventos).values({
      codmot,
      foneDigitos: digitos,
      acao: input.naoFunciona ? 'marcou_nao_funciona' : 'desmarcou',
      numero: row.numero,
      rotulo: row.rotulo,
      origem: row.origem,
      operatorId: input.operatorId,
      authorName: autor,
    })

    logger.info(
      { codmot, acao: input.naoFunciona ? 'marcou_nao_funciona' : 'desmarcou', origem: row.origem },
      '[manifesto] marca de telefone alterada',
    )
    return paraRegistro(row)
  })
}
