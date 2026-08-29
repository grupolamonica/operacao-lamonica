/**
 * F3 — o POSTO DE AUTOMAÇÃO.
 *
 * Uma máquina por vez assume a baixa automática. Quem ativa passa a executar; as
 * outras telas só mostram que está ativo e onde.
 *
 * POR QUE UM POSTO E NÃO RODÍZIO ENTRE AS MÁQUINAS (decisão do Danilo, 29/08):
 * a baixa roda sob a conta Rodopar da máquina que executa. Com rodízio, um mesmo
 * lote de baixas automáticas apareceria espalhado em vários nomes no ERP, e a
 * pergunta "quem baixou isto?" deixaria de ter resposta única. Com posto, tudo sai
 * sob um nome só e a auditoria fecha.
 *
 * O custo é real e foi aceito: a vazão passa a ser a de UMA máquina — ~10 baixas por
 * hora, medido em 1.637 baixas de 30 dias (mediana de 360 s entre baixas do mesmo
 * usuário). Num pico de segunda-feira isso é ~7 h de fila. Por isso o teto diário
 * existe e por isso a fila é ordenada por horas em aberto.
 *
 * EXCLUSÃO MÚTUA DE VERDADE: `SET ... NX` é atômico no Redis. Duas máquinas clicando
 * ao mesmo tempo — a primeira ganha, a segunda recebe null e vê quem está no posto.
 * Não há checagem em código que sobreviva a essa corrida; o NX sim.
 *
 * TTL CURTO E RENOVAÇÃO PELO PRÓPRIO POLLING: o agente já bate em /baixa/proximo a
 * cada ~15 s. Se quem bate é o dono do posto, o TTL estende. Máquina que morre libera
 * o posto em ≤ 2 min sem ninguém precisar limpar nada — e "sem batida" e "chave
 * expirada" viram a mesma resposta, que é o que se quer.
 */
import { redis } from '../../redis/client'
import { logger } from '../../lib/logger'

/**
 * O mínimo do Redis que este módulo usa. Existe para o teste poder injetar falha —
 * exclusão mútua que nunca viu duas máquinas competindo é promessa, não garantia.
 */
export interface RedisPosto {
  get(chave: string): Promise<string | null>
  set(chave: string, valor: string, ex: 'EX', ttl: number, nx?: 'NX'): Promise<string | null>
  del(chave: string): Promise<number>
}

const CHAVE = 'manifesto:baixa:auto:posto'

/**
 * 120 s. Curto de propósito: é o tempo máximo que o posto fica preso numa máquina
 * morta. Com o agente batendo a cada 15 s, sobra folga de 8 batidas — uma rede lenta
 * não derruba o posto de quem está vivo.
 */
const TTL_SEG = 120

export interface Posto {
  /** nome da máquina, como o agente se identifica em /baixa/proximo */
  agente: string
  /** dono do token trm_ — é a conta Rodopar sob a qual a baixa vai rodar */
  user_id: string | null
  /** nome de quem ativou, para a tela dizer "ativo em X (Fulano)" */
  nome: string | null
  desde: string
  visto_em: string
}

function parse(bruto: string | null): Posto | null {
  if (!bruto) return null
  try {
    return JSON.parse(bruto) as Posto
  } catch {
    return null
  }
}

/** Quem está no posto agora, ou null. Nunca lança: leitura de apoio. */
export async function postoAtual(r: RedisPosto = redis as unknown as RedisPosto): Promise<Posto | null> {
  try {
    return parse(await r.get(CHAVE))
  } catch {
    return null
  }
}

/**
 * Tenta assumir o posto. `SET NX EX` — se já houver dono, devolve quem é sem tocar
 * em nada.
 *
 * Reativar do MESMO agente é idempotente e apenas renova: sem isso, um duplo clique
 * ou um refresh da tela devolveria "já está ativo em você mesmo", que é uma mensagem
 * de erro para uma situação que não é erro.
 */
export async function assumirPosto(
  agente: string,
  userId: string | null,
  nome: string | null,
  r: RedisPosto = redis as unknown as RedisPosto,
): Promise<{ ok: true; posto: Posto } | { ok: false; posto: Posto | null; motivo: string }> {
  const agora = new Date().toISOString()
  const novo: Posto = { agente, user_id: userId, nome, desde: agora, visto_em: agora }

  try {
    const gravou = await r.set(CHAVE, JSON.stringify(novo), 'EX', TTL_SEG, 'NX')
    if (gravou) {
      logger.info({ agente, userId }, '[baixa-auto] posto assumido')
      return { ok: true, posto: novo }
    }

    const dono = await postoAtual(r)
    if (dono?.agente === agente) {
      // mesmo agente: renova mantendo `desde`, para a tela não zerar o "ativo desde"
      const renovado: Posto = { ...dono, user_id: userId, nome, visto_em: agora }
      await r.set(CHAVE, JSON.stringify(renovado), 'EX', TTL_SEG)
      return { ok: true, posto: renovado }
    }
    return {
      ok: false,
      posto: dono,
      motivo: dono
        ? `A automação já está ativa em ${dono.agente}${dono.nome ? ` (${dono.nome})` : ''}.`
        : 'Não foi possível assumir o posto — tente de novo.',
    }
  } catch (e) {
    // Redis fora NÃO pode virar "posto assumido": sem posto o job não enfileira, que
    // é o estado seguro. Falhar fechado aqui é a diferença entre não automatizar e
    // automatizar sem controle.
    logger.error({ erro: e instanceof Error ? e.message : String(e) }, '[baixa-auto] falha ao assumir posto')
    return { ok: false, posto: null, motivo: 'Redis indisponível — a automação não pode ser ativada agora.' }
  }
}

/**
 * Renova o TTL se — e somente se — quem bate é o dono. Chamado do fluxo que o agente
 * já executa a cada 15 s, então não cria tráfego novo.
 *
 * Silencioso por natureza: o agente que não é dono do posto bate igual (ele continua
 * pegando pedidos humanos), e isso não é erro nenhum.
 */
export async function renovarPosto(agente: string, r: RedisPosto = redis as unknown as RedisPosto): Promise<void> {
  try {
    const dono = await postoAtual(r)
    if (!dono || dono.agente !== agente) return
    const renovado: Posto = { ...dono, visto_em: new Date().toISOString() }
    await r.set(CHAVE, JSON.stringify(renovado), 'EX', TTL_SEG)
  } catch {
    // renovação é best-effort: se falhar, o TTL expira e o posto fica livre — de novo,
    // o lado seguro do erro
  }
}

/**
 * Larga o posto. Só o dono consegue: sem essa checagem, um operador desativaria a
 * automação da máquina de outro sem perceber, e o único sinal seria a fila parando.
 */
export async function largarPosto(
  agente: string,
  r: RedisPosto = redis as unknown as RedisPosto,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    const dono = await postoAtual(r)
    if (!dono) return { ok: true }
    if (dono.agente !== agente) {
      return { ok: false, motivo: `O posto é de ${dono.agente} — só essa máquina pode desativar.` }
    }
    await r.del(CHAVE)
    logger.info({ agente }, '[baixa-auto] posto liberado')
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}
