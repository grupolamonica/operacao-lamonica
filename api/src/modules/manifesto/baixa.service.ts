import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import { redis } from '../../redis/client'
import {
  manifestoBaixaPedidos,
  RC_EXIGE_CONFERENCIA,
  SITUACOES_ATIVAS,
  users,
  type SituacaoPedido,
} from '../../db/schema'
import { logger } from '../../lib/logger'
import { chaveManifesto, normalizarSerie } from './tratativas.service'

/**
 * Fila de pedidos de baixa — ver drizzle/manifesto-baixa-pedidos.sql para o "por quê".
 *
 * O operador aperta o botão; o robô (repo robo-baixa-manifesto) pega da fila e executa. A fila
 * também é a memória compartilhada de "Efetuar clicado e não confirmado", que hoje vive partida
 * entre os %LOCALAPPDATA% das máquinas dos operadores — e foi essa divisão que deixou o robô
 * clicar Efetuar duas vezes no manifesto 69240 em 17/08/2026.
 */

export interface NovoPedido {
  codman: number
  filial: number
  serie?: string | null
  placa?: string | null
  destino?: string | null
  estadoSistema?: string | null
  operatorId: string | null
}

export interface PedidoResumo {
  id: string
  situacao: SituacaoPedido
  criado_em: string
  autor: string | null
  rc: number | null
  mensagem: string | null
  concluido_em: string | null
  agente: string | null
}

/**
 * Batida do agente. Vive no Redis, não no Postgres: é estado efêmero ("alguém está de
 * plantão agora?"), não fato histórico — e fato efêmero em tabela vira lixo que ninguém
 * limpa.
 *
 * POR QUE EXISTE: sem isso a tela mostra um pedido em `na_fila` com cara de que algo
 * está acontecendo, quando pode não haver agente nenhum rodando. Foi o que aconteceu
 * em 21/08: o operador clicou BAIXAR, viu NA FILA e ficou esperando uma janela abrir.
 * Um botão que promete o que não pode cumprir é pior que um botão desabilitado.
 *
 * O agente pede trabalho a cada ~15s, então ausência de batida por poucos minutos já
 * significa que ele não está de pé. TTL de 10 min: some sozinho, e "sem batida" e
 * "chave expirada" são a mesma resposta.
 */
const REDIS_KEY_AGENTE = 'manifesto:baixa:agente'
const TTL_AGENTE_SEG = 600

export interface BatidaAgente {
  agente: string
  visto_em: string
}

async function registrarBatidaAgente(agente: string): Promise<void> {
  const batida: BatidaAgente = { agente, visto_em: new Date().toISOString() }
  try {
    await redis.set(REDIS_KEY_AGENTE, JSON.stringify(batida), 'EX', TTL_AGENTE_SEG)
  } catch {
    // saber que o agente está vivo é informação de apoio: nunca pode impedir o agente
    // de pegar trabalho.
  }
}

/** Último agente que pediu trabalho, ou null se ninguém pediu nos últimos 10 min. */
export async function agenteDePlantao(): Promise<BatidaAgente | null> {
  try {
    const raw = await redis.get(REDIS_KEY_AGENTE)
    return raw ? (JSON.parse(raw) as BatidaAgente) : null
  } catch {
    return null
  }
}

/** Violação de índice único no Postgres. */
const UNIQUE_VIOLATION = '23505'

function ehUnique(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    (erro as { code?: string }).code === UNIQUE_VIOLATION
  )
}

async function nomeDoOperador(operatorId: string | null): Promise<string | null> {
  if (!operatorId) return null
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, operatorId)).limit(1)
  return u?.name ?? null
}

function resumo(row: typeof manifestoBaixaPedidos.$inferSelect): PedidoResumo {
  return {
    id: row.id,
    situacao: row.situacao as SituacaoPedido,
    criado_em: row.createdAt.toISOString(),
    autor: row.authorName,
    rc: row.rc,
    mensagem: row.mensagem,
    concluido_em: row.concluidoEm?.toISOString() ?? null,
    agente: row.agente,
  }
}

async function pedidoAtivo(
  codman: number,
  filial: number,
  serie: string,
): Promise<PedidoResumo | null> {
  const [row] = await db
    .select()
    .from(manifestoBaixaPedidos)
    .where(
      and(
        eq(manifestoBaixaPedidos.codman, codman),
        eq(manifestoBaixaPedidos.filial, filial),
        eq(manifestoBaixaPedidos.serie, serie),
        inArray(manifestoBaixaPedidos.situacao, [...SITUACOES_ATIVAS]),
      ),
    )
    .limit(1)
  return row ? resumo(row) : null
}

/**
 * Enfileira um pedido. Devolve `{ok:false}` quando já existe pedido ATIVO para o mesmo manifesto
 * — inclusive em `conferencia`, que é o caso importante: manifesto com dúvida aberta não pode
 * receber pedido novo, porque o Efetuar dele pode já ter sido clicado.
 *
 * A unicidade é do BANCO (índice parcial), não daqui: dois operadores clicando ao mesmo tempo
 * passariam por qualquer verificação feita em código antes do insert.
 */
export async function pedirBaixa(
  input: NovoPedido,
): Promise<
  { ok: true; pedido: PedidoResumo } | { ok: false; motivo: string; pedido?: PedidoResumo }
> {
  const serie = normalizarSerie(input.serie)
  const autor = await nomeDoOperador(input.operatorId)
  try {
    const [row] = await db
      .insert(manifestoBaixaPedidos)
      .values({
        codman: input.codman,
        filial: input.filial,
        serie,
        situacao: 'na_fila',
        operatorId: input.operatorId,
        authorName: autor,
        placa: input.placa?.slice(0, 10) ?? null,
        destino: input.destino?.slice(0, 120) ?? null,
        estadoSistema: input.estadoSistema?.slice(0, 30) ?? null,
      })
      .returning()
    logger.info({ codman: input.codman, filial: input.filial, serie, autor }, '[manifesto] baixa pedida')
    return { ok: true, pedido: resumo(row) }
  } catch (erro) {
    if (!ehUnique(erro)) throw erro
    const atual = await pedidoAtivo(input.codman, input.filial, serie)
    const motivo =
      atual?.situacao === 'conferencia'
        ? 'Este manifesto aguarda conferência humana: o Efetuar pode já ter sido clicado. Confira no Rodopar antes de pedir de novo.'
        : 'Já existe um pedido de baixa em andamento para este manifesto.'
    logger.warn({ codman: input.codman, situacao: atual?.situacao }, '[manifesto] baixa recusada')
    return { ok: false, motivo, pedido: atual ?? undefined }
  }
}

/**
 * Último pedido de cada manifesto, para a tela pintar o estado do botão. Aditivo: se esta leitura
 * falhar, a tela deve seguir mostrando os manifestos — o estado deles é a função crítica.
 */
export async function pedidosPorManifesto(
  refs: { codman: number; filial: number; serie?: string | null }[],
): Promise<Record<string, PedidoResumo>> {
  if (!refs.length) return {}
  const rows = await db
    .select()
    .from(manifestoBaixaPedidos)
    .where(
      inArray(
        manifestoBaixaPedidos.codman,
        refs.map((r) => r.codman),
      ),
    )
    .orderBy(desc(manifestoBaixaPedidos.createdAt))

  const querido = new Set(refs.map((r) => chaveManifesto(r.codman, r.filial, r.serie)))
  const saida: Record<string, PedidoResumo> = {}
  for (const row of rows) {
    const chave = chaveManifesto(row.codman, row.filial, row.serie)
    // ordenado por createdAt desc: o primeiro de cada chave é o mais recente
    if (querido.has(chave) && !saida[chave]) saida[chave] = resumo(row)
  }
  return saida
}

/**
 * O agente pega o próximo da fila.
 *
 * Devolve null quando a fila está vazia OU quando já existe um `executando` — o Rodopar é sessão
 * única por usuário e duas execuções simultâneas derrubam uma à outra (rc=8). O índice parcial
 * `_um_por_vez_idx` é o insurance de verdade; a checagem aqui só evita gastar a tentativa.
 */
export async function reivindicarProximo(
  agente: string,
): Promise<{ codman: number; filial: number; serie: string; id: string } | null> {
  // antes de qualquer early return: "pedi trabalho e não tinha" também prova que estou vivo
  await registrarBatidaAgente(agente)

  const emCurso = await db
    .select({ id: manifestoBaixaPedidos.id })
    .from(manifestoBaixaPedidos)
    .where(eq(manifestoBaixaPedidos.situacao, 'executando'))
    .limit(1)
  if (emCurso.length) return null

  const [proximo] = await db
    .select({ id: manifestoBaixaPedidos.id })
    .from(manifestoBaixaPedidos)
    .where(eq(manifestoBaixaPedidos.situacao, 'na_fila'))
    .orderBy(asc(manifestoBaixaPedidos.createdAt))
    .limit(1)
  if (!proximo) return null

  try {
    const [row] = await db
      .update(manifestoBaixaPedidos)
      .set({ situacao: 'executando', reivindicadoEm: new Date(), agente: agente.slice(0, 120) })
      .where(
        and(eq(manifestoBaixaPedidos.id, proximo.id), eq(manifestoBaixaPedidos.situacao, 'na_fila')),
      )
      .returning()
    if (!row) return null
    logger.info({ codman: row.codman, agente }, '[manifesto] pedido reivindicado')
    return { codman: row.codman, filial: row.filial, serie: row.serie, id: row.id }
  } catch (erro) {
    // perdeu a corrida no índice `_um_por_vez_idx`: outro agente pegou primeiro
    if (ehUnique(erro)) return null
    throw erro
  }
}

/**
 * O agente devolve o resultado. O `rc` decide a situação final:
 *
 *   0              → concluido
 *   6 ou 11        → conferencia  (pode ter gravado — NUNCA volta pra fila sozinho)
 *   qualquer outro → falhou       (o operador pode pedir de novo)
 *
 * `efetuar_clicado` reforça: se o robô clicou Efetuar e o rc não é 0, é conferência mesmo que o
 * código não esteja na lista. Preferimos travar um documento a duplicar um lançamento.
 */
export async function registrarResultado(input: {
  id: string
  rc: number
  mensagem?: string | null
  efetuarClicado?: boolean | null
}): Promise<PedidoResumo | null> {
  const exigeConferencia =
    (RC_EXIGE_CONFERENCIA as readonly number[]).includes(input.rc) ||
    (input.rc !== 0 && input.efetuarClicado === true)
  const situacao: SituacaoPedido =
    input.rc === 0 ? 'concluido' : exigeConferencia ? 'conferencia' : 'falhou'

  const [row] = await db
    .update(manifestoBaixaPedidos)
    .set({
      situacao,
      rc: input.rc,
      mensagem: input.mensagem?.slice(0, 4000) ?? null,
      efetuarClicado: input.efetuarClicado ?? null,
      concluidoEm: new Date(),
    })
    .where(eq(manifestoBaixaPedidos.id, input.id))
    .returning()
  if (!row) return null
  logger.info(
    { codman: row.codman, rc: input.rc, situacao, efetuar_clicado: input.efetuarClicado },
    '[manifesto] resultado da baixa',
  )
  return resumo(row)
}

/**
 * Libera um manifesto que estava em `conferencia`, depois de a PESSOA conferir no Rodopar. É o
 * espelho do `--liberar-clique` do robô: a dúvida acaba porque alguém olhou, não porque o tempo
 * passou. Fica registrado quem liberou.
 */
export async function liberarConferencia(
  id: string,
  operatorId: string | null,
): Promise<PedidoResumo | null> {
  const autor = await nomeDoOperador(operatorId)
  const [atual] = await db
    .select()
    .from(manifestoBaixaPedidos)
    .where(and(eq(manifestoBaixaPedidos.id, id), eq(manifestoBaixaPedidos.situacao, 'conferencia')))
    .limit(1)
  if (!atual) return null

  const marca = '[conferido e liberado por ' + (autor ?? 'operador') + ']'
  const [row] = await db
    .update(manifestoBaixaPedidos)
    .set({
      situacao: 'falhou',
      mensagem: ((atual.mensagem ?? '') + ' ' + marca).trim().slice(0, 4000),
    })
    .where(and(eq(manifestoBaixaPedidos.id, id), eq(manifestoBaixaPedidos.situacao, 'conferencia')))
    .returning()
  if (!row) return null
  logger.warn({ codman: row.codman, autor }, '[manifesto] conferência liberada manualmente')
  return resumo(row)
}
