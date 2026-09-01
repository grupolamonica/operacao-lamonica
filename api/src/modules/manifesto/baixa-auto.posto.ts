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

/**
 * Import TARDIO do cliente Redis, e não no topo do arquivo.
 *
 * `redis/client.ts` lança na importação quando REDIS_URL não existe. Importando no
 * topo, este módulo derrubava qualquer contexto sem Redis — inclusive o `bun test`
 * do CI, que injeta o próprio cliente e nunca chega a usar o real. O teste morria na
 * linha de import, antes de exercitar uma linha sequer da exclusão mútua.
 *
 * Com o import aqui dentro, quem injeta nunca carrega o módulo; quem não injeta
 * carrega na primeira chamada, em runtime, onde REDIS_URL existe de verdade.
 */
async function clienteRedis(): Promise<RedisPosto> {
  const { redis } = await import('../../redis/client')
  return redis as unknown as RedisPosto
}

const CHAVE = 'manifesto:baixa:auto:posto'

/**
 * 600 s — o MESMO TTL da batida do agente (`baixa.service.ts`, TTL_AGENTE_SEG).
 *
 * ── POR QUE MUDOU DE 120 PARA 600 (01/09/2026) ──────────────────────────────────
 *
 * O raciocínio original ("com o agente batendo a cada 15 s, sobra folga de 8 batidas")
 * estava certo para um agente OCIOSO e errado para um agente TRABALHANDO. A única coisa
 * que renova o posto é `POST /baixa/proximo`, e o agente só chama isso quando está
 * pedindo trabalho. Enquanto executa uma baixa, o laço do PowerShell fica parado em
 * `Processar $r.pedido` — síncrono, sem uma única chamada.
 *
 * Baixa medida em produção: ~3 minutos. TTL: 2 minutos. Resultado: a automação
 * DESLIGAVA A SI MESMA no meio da primeira baixa que autorizava.
 *
 * Cronometrado em 01/09, com o posto observado de 15 em 15 s:
 *
 *     12:47:04  posto assumido
 *     12:47→12:53  vivo e renovando (5 min ocioso, muito além dos 120 s)
 *     13:00:00  ciclo enfileira 69679 — prova de que o posto ainda estava vivo
 *     13:00→13:03  robô executando, ZERO chamadas
 *     13:03:00  concluído rc=0
 *     19:20     posto = null
 *
 * Nenhum deploy naquele dia. O que matou foi o trabalho.
 *
 * ── POR QUE 600 E NÃO OUTRO NÚMERO ──────────────────────────────────────────────
 *
 * Não é folga arbitrária: é o TTL que a batida do agente já usa. Os dois respondem a
 * MESMA pergunta — "essa máquina está aí?" — e tê-los com tolerâncias 5x diferentes é
 * o que produzia o sintoma clássico: o chip "Robô conectado" (600 s) verde enquanto a
 * automação (120 s) já tinha caído. Dois relógios discordando sobre o mesmo fato.
 *
 * O custo aceito: posto preso numa máquina morta por até 10 min em vez de 2. Esse
 * fantasma JÁ EXISTE hoje para o "Robô conectado" — alinhar não cria risco novo, só
 * para de esconder o que já havia.
 *
 * Isto sozinho não basta para uma baixa que trave por mais de 10 min; por isso
 * `registrarResultado` também renova, e aí o TTL só precisa cobrir UMA baixa, nunca a
 * cadeia inteira.
 */
const TTL_SEG = 600

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

/**
 * Quem está no posto agora, ou null. Nunca lança: leitura de apoio.
 *
 * ATENÇÃO ao que `null` significa aqui: ele é AMBÍGUO de propósito, e o lado ambíguo é
 * o seguro. "Ninguém no posto" e "Redis inacessível" devolvem o mesmo `null`, e quem
 * consome trata os dois como "não automatize" — que é o certo nos dois casos.
 *
 * O que estava errado até 01/09 era o catch mudo: o erro sumia, então a diferença entre
 * "posto livre" e "Redis quebrado" não existia nem no log. Agora existe.
 */
export async function postoAtual(r?: RedisPosto): Promise<Posto | null> {
  try {
    const cli = r ?? (await clienteRedis())
    return parse(await cli.get(CHAVE))
  } catch (e) {
    logger.warn(
      { erro: e instanceof Error ? e.message : String(e) },
      '[baixa-auto] não consegui ler o posto (Redis) — tratando como vazio, a automação não vai agir',
    )
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
  r?: RedisPosto,
): Promise<{ ok: true; posto: Posto } | { ok: false; posto: Posto | null; motivo: string }> {
  const agora = new Date().toISOString()
  const novo: Posto = { agente, user_id: userId, nome, desde: agora, visto_em: agora }

  try {
    const cli = r ?? (await clienteRedis())
    const gravou = await cli.set(CHAVE, JSON.stringify(novo), 'EX', TTL_SEG, 'NX')
    if (gravou) {
      logger.info({ agente, userId }, '[baixa-auto] posto assumido')
      return { ok: true, posto: novo }
    }

    const dono = await postoAtual(cli)
    if (dono?.agente === agente) {
      // mesmo agente: renova mantendo `desde`, para a tela não zerar o "ativo desde"
      const renovado: Posto = { ...dono, user_id: userId, nome, visto_em: agora }
      await cli.set(CHAVE, JSON.stringify(renovado), 'EX', TTL_SEG)
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
export async function renovarPosto(agente: string, r?: RedisPosto): Promise<void> {
  try {
    const cli = r ?? (await clienteRedis())
    const dono = await postoAtual(cli)
    if (!dono || dono.agente !== agente) return
    const renovado: Posto = { ...dono, visto_em: new Date().toISOString() }
    await cli.set(CHAVE, JSON.stringify(renovado), 'EX', TTL_SEG)
  } catch (e) {
    // Continua best-effort — falhar aqui deixa o TTL expirar, que é o lado seguro do
    // erro. O que mudou em 01/09 foi o SILÊNCIO: este catch era vazio, então oito
    // renovações falhadas seguidas derrubavam o posto sem UMA linha de log em lugar
    // nenhum. Passei um dia inteiro atrás de uma causa que teria aparecido aqui.
    //
    // warn e não error: renovação perdida é recuperável (a próxima batida resolve). Só
    // vira problema se repetir, e repetido no log é visível.
    logger.warn(
      { agente, erro: e instanceof Error ? e.message : String(e) },
      '[baixa-auto] falha ao renovar o posto — se repetir, ele expira e a automação para',
    )
  }
}

/**
 * Larga o posto. Só o dono consegue: sem essa checagem, um operador desativaria a
 * automação da máquina de outro sem perceber, e o único sinal seria a fila parando.
 */
export async function largarPosto(
  agente: string,
  r?: RedisPosto,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    const cli = r ?? (await clienteRedis())
    const dono = await postoAtual(cli)
    if (!dono) return { ok: true }
    if (dono.agente !== agente) {
      return { ok: false, motivo: `O posto é de ${dono.agente} — só essa máquina pode desativar.` }
    }
    await cli.del(CHAVE)
    logger.info({ agente }, '[baixa-auto] posto liberado')
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

// ── Trava de execução ────────────────────────────────────────────────────────

const CHAVE_EXEC = 'manifesto:baixa:auto:executando'

/**
 * 180 s. Cobre um ciclo inteiro com folga (o fetch do SPX traz ~1.300 viagens em
 * 3 abas e é a parte lenta). Se o processo morrer no meio, a trava expira sozinha
 * em vez de bloquear a automação para sempre.
 */
const TTL_EXEC_SEG = 180

/**
 * Impede DOIS ciclos ao mesmo tempo — o agendado das :10 e um disparo manual, por
 * exemplo.
 *
 * Sem isto, dois ciclos concorrentes leriam `usadoHoje()` antes de qualquer insert
 * e cada um acharia que tem o teto inteiro disponível. O índice único dos pedidos
 * ainda salvaria o caso comum (mesma ordenação, mesmos 3 manifestos, o segundo
 * recusado), mas basta o universo mudar entre as duas leituras para os dois
 * escolherem manifestos diferentes e o teto do dia dobrar em silêncio.
 *
 * Devolve `null` quando não conseguiu a trava — quem chama decide o que dizer.
 */
export async function travarExecucao(r?: RedisPosto): Promise<(() => Promise<void>) | null> {
  try {
    const cli = r ?? (await clienteRedis())
    const pegou = await cli.set(CHAVE_EXEC, new Date().toISOString(), 'EX', TTL_EXEC_SEG, 'NX')
    if (!pegou) return null
    return async () => {
      try {
        await cli.del(CHAVE_EXEC)
      } catch {
        // soltar é best-effort: o TTL garante que a trava não fica presa
      }
    }
  } catch {
    // Redis fora: NÃO executa. Mesma doutrina do posto — sem coordenação, não age.
    return null
  }
}
