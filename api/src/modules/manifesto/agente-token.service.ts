/**
 * Token do agente: liga a pessoa que usa a tela ao robô que roda no PC dela.
 *
 * Ver `drizzle/manifesto-agente-tokens.sql` para o porquê da tabela. Aqui moram as
 * três operações e as decisões de segurança que não cabem no DDL.
 */
import { and, eq, isNull, sql } from 'drizzle-orm'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '../../db/client'
import { manifestoAgenteTokens, users } from '../../db/schema'
import { logger } from '../../lib/logger'

/**
 * Prefixo fixo no começo do token.
 *
 * Serve para duas coisas práticas: quem vê a string num log ou num print sabe na hora
 * o que ela é (e que precisa ser trocada), e varredores de segredo em repositório
 * conseguem procurar por um padrão em vez de por entropia.
 */
const PREFIXO = 'trm_'

/** Tamanho em bytes do segredo. 32 bytes = 256 bits — o mesmo patamar de uma chave. */
const BYTES = 32

export interface TokenGerado {
  /** O valor completo. Existe SÓ nesta resposta, nunca é gravado nem relido. */
  token: string
  prefixo: string
  criado_em: string
}

export interface TokenVisivel {
  id: string
  prefixo: string
  apelido: string | null
  criado_em: string
  usado_em: string | null
}

export interface DonoDoToken {
  user_id: string
  nome: string
  token_id: string
}

function hashDe(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Gera o token da pessoa, revogando o anterior dela.
 *
 * É UM ativo por pessoa (índice parcial no banco), e isso é deliberado: "o robô da
 * Maria" precisa ser uma coisa só para a fila poder rotear. Trocar de máquina é gerar
 * de novo, não acumular — e gerar de novo derruba a máquina antiga na hora, que é
 * exatamente o comportamento desejado quando alguém troca de computador ou perde um.
 */
export async function gerarToken(userId: string, apelido?: string | null): Promise<TokenGerado> {
  const segredo = randomBytes(BYTES).toString('base64url')
  const token = `${PREFIXO}${segredo}`

  const agora = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(manifestoAgenteTokens)
      .set({ revogadoEm: agora, revogadoPor: userId })
      .where(and(eq(manifestoAgenteTokens.userId, userId), isNull(manifestoAgenteTokens.revogadoEm)))
    await tx.insert(manifestoAgenteTokens).values({
      userId,
      tokenHash: hashDe(token),
      // 4 do prefixo + 6 do segredo: o bastante para a pessoa reconhecer qual é o
      // dela numa lista, longe do bastante para ajudar a adivinhar os outros 250 bits.
      prefixo: token.slice(0, 10),
      apelido: (apelido || '').trim().slice(0, 60) || null,
      criadoEm: agora,
    })
  })

  logger.info({ userId }, '[manifesto] token de agente gerado (anterior revogado)')
  return { token, prefixo: token.slice(0, 10), criado_em: agora.toISOString() }
}

/** O token ativo da pessoa, sem o valor. Null se ela nunca gerou ou revogou o dela. */
export async function tokenAtivo(userId: string): Promise<TokenVisivel | null> {
  const [row] = await db
    .select()
    .from(manifestoAgenteTokens)
    .where(and(eq(manifestoAgenteTokens.userId, userId), isNull(manifestoAgenteTokens.revogadoEm)))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    prefixo: row.prefixo,
    apelido: row.apelido,
    criado_em: row.criadoEm.toISOString(),
    usado_em: row.usadoEm ? row.usadoEm.toISOString() : null,
  }
}

/** Revoga o token ativo da pessoa. Idempotente: revogar o que não existe é sucesso. */
export async function revogarToken(userId: string, porQuem: string): Promise<void> {
  await db
    .update(manifestoAgenteTokens)
    .set({ revogadoEm: new Date(), revogadoPor: porQuem })
    .where(and(eq(manifestoAgenteTokens.userId, userId), isNull(manifestoAgenteTokens.revogadoEm)))
  logger.info({ userId, porQuem }, '[manifesto] token de agente revogado')
}

/**
 * Quem é o dono deste token? Null se não existe, foi revogado, ou não é um token nosso.
 *
 * O caminho quente: cada agente chama isto a cada ~15s.
 *
 * Sobre comparação em tempo constante: a busca é por índice único no HASH, não por
 * varredura comparando segredos, então não há vazamento de tempo proporcional ao
 * quanto o token acertou — o Postgres compara hashes completos de 64 chars. O
 * `timingSafeEqual` abaixo é a confirmação final e existe para que uma mudança futura
 * na consulta não reintroduza silenciosamente uma comparação ingênua.
 */
export async function donoDoToken(token: string): Promise<DonoDoToken | null> {
  if (!token.startsWith(PREFIXO)) return null

  const alvo = hashDe(token)
  const [row] = await db
    .select({
      id: manifestoAgenteTokens.id,
      userId: manifestoAgenteTokens.userId,
      tokenHash: manifestoAgenteTokens.tokenHash,
      nome: users.name,
      ativo: users.isActive,
    })
    .from(manifestoAgenteTokens)
    .innerJoin(users, eq(users.id, manifestoAgenteTokens.userId))
    .where(and(eq(manifestoAgenteTokens.tokenHash, alvo), isNull(manifestoAgenteTokens.revogadoEm)))
    .limit(1)

  if (!row) return null
  // Usuário desativado perde o robô junto. Sem isto, desligar alguém no torre deixaria
  // a máquina dela baixando manifesto normalmente.
  if (!row.ativo) return null

  const a = Buffer.from(row.tokenHash, 'utf8')
  const b = Buffer.from(alvo, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  return { user_id: row.userId, nome: row.nome, token_id: row.id }
}

/**
 * Carimba o último uso — no MÁXIMO uma vez a cada 5 min por token.
 *
 * O agente pergunta "tem trabalho?" a cada ~15s. Um UPDATE por pergunta seriam ~240
 * escritas por hora por máquina, numa linha só, para uma informação cuja utilidade é
 * "quando foi a última vez que essa máquina apareceu". A granularidade de 5 min
 * responde igual e não fica batendo no banco à toa.
 */
export async function marcarUso(tokenId: string): Promise<void> {
  try {
    await db
      .update(manifestoAgenteTokens)
      .set({ usadoEm: new Date() })
      .where(
        and(
          eq(manifestoAgenteTokens.id, tokenId),
          sql`(${manifestoAgenteTokens.usadoEm} IS NULL OR ${manifestoAgenteTokens.usadoEm} < now() - interval '5 minutes')`,
        ),
      )
  } catch {
    // Registrar o uso é apoio. Nunca pode impedir o agente de pegar trabalho — mesma
    // regra do heartbeat no Redis.
  }
}
