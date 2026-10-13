/**
 * As barreiras do lado do ERP e do ROBÔ na baixa automática. PURAS: sem I/O, sem
 * relógio implícito — quem lê o Redis e o Postgres é o orquestrador
 * (`baixa-auto.service.ts`), e o "agora" chega aqui como valor.
 *
 * As regras do cliente (`baixa-auto.regras.ts`) respondem "a evidência do cliente
 * sustenta a baixa?". Este módulo responde a pergunta que faltava: "o que o ERP e o
 * próprio robô já disseram sobre este manifesto deixa pedir de novo?".
 *
 * ── POR QUE EXISTE (13/10/2026, manifesto 70329) ─────────────────────────────────
 *
 * As fontes do CLIENTE (SPX/Galileu) sempre tiveram portão de frescor. O snapshot do
 * COLETOR — o que o ERP diz — não tinha nenhum. Naquele dia o coletor parou de logar
 * no SQL Server às 12:38 (trigger de logon), o último snapshot ficou sendo o das 12:33,
 * e nele o 70329 seguia aberto. O AGENDADOR do Rodopar o baixou às 13:10. A partir de
 * 13:49 a baixa automática o enfileirou a cada ~10 min: o robô consultava o banco, via
 * "Baixado" e saía com rc=4 em segundos; o torre gravava `falhou` e o ciclo seguinte
 * pedia de novo. Mais de 20 tentativas só naquele dia — e um laço desses, a cada 10
 * min, gasta 144 pedidos por dia contra um teto de 100: bloquearia TODA a baixa
 * automática real, por causa de um manifesto que não tinha nada a fazer.
 *
 * Três barreiras, cada uma fecha um buraco diferente:
 *   A1  snapshot velho  -> NINGUÉM é elegível no ciclo: a leitura do ERP não é de agora
 *   A2  prova do robô   -> rc=4 concluído DEPOIS do snapshot: a prova é mais nova que a evidência
 *   A3  disjuntor       -> N falhas automáticas hoje na mesma chave: daí em diante, só pedido humano
 * A1 sozinha teria resolvido o 70329. A2 e A3 existem porque o próximo laço não vai
 * ter a mesma causa: a A2 cobre o snapshot fresco que ainda não viu a baixa, e a A3 é
 * o teto de qualquer laço que nenhuma das outras reconheça.
 */

/** rc do robô para "não está pendente" — já baixado, cancelado ou inexistente. */
export const RC_NAO_PENDENTE = 4

/** O pedido de baixa, na parte que as barreiras usam (ver manifesto_baixa_pedidos). */
export interface PedidoParaBarreira {
  /** 'humano' | 'spx' | 'galileu' — só o que NÃO é humano conta para o disjuntor */
  origem: string
  situacao: string
  rc: number | null
  createdAt: Date
  concluidoEm: Date | null
}

const HORA_BRASILIA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/**
 * HH:MM no horário de Brasília. Fuso EXPLÍCITO e não o do processo: a reprova é lida
 * pelo operador, e "13:12" tem que ser a hora do relógio dele mesmo que o container
 * suba um dia sem TZ.
 */
export function horaBrasilia(d: Date): string {
  return HORA_BRASILIA.format(d)
}

/**
 * A1 — o snapshot do coletor é recente o bastante para decidir?
 *
 * `idadeMin` é a de `getPendencias()` (calculada de `recebido_em`). Null = não há
 * snapshot nenhum, e isso também reprova: sem leitura do ERP não há o que afirmar.
 *
 * O limite padrão (15 min) é o MESMO do aviso "Coletor sem enviar há N min" da tela
 * (BaixaManifestoPage, `stale`). Se a tela já avisa o operador que o dado envelheceu,
 * a automação não pode continuar agindo em cima dele como se fosse de agora.
 *
 * Devolve a reprova, ou null quando o snapshot serve.
 */
export function reprovaDoSnapshot(idadeMin: number | null, limiteMin: number): string | null {
  if (idadeMin == null) return 'sem snapshot do coletor — sem leitura do ERP'
  if (idadeMin > limiteMin) {
    return `snapshot do coletor com ${idadeMin} min (limite ${limiteMin}) — sem leitura fresca do ERP`
  }
  return null
}

/** O pedido mais recente da chave — por `createdAt`, como `pedidosPorManifesto`. */
function maisRecente(pedidos: readonly PedidoParaBarreira[]): PedidoParaBarreira | null {
  let atual: PedidoParaBarreira | null = null
  for (const p of pedidos) {
    if (!atual || p.createdAt.getTime() > atual.createdAt.getTime()) atual = p
  }
  return atual
}

/**
 * A2 — o robô já provou, DEPOIS do snapshot, que este manifesto não está pendente?
 *
 * rc=4 quer dizer que o robô consultou o banco do Rodopar e o manifesto não estava
 * em aberto. Se isso aconteceu depois de o torre receber o snapshot, a evidência do
 * ERP que o snapshot carrega é ANTERIOR à prova — e pedir de novo é perguntar de novo
 * uma coisa já respondida. Foi o laço do 70329.
 *
 * Só o pedido MAIS RECENTE da chave decide: um rc=4 antigo seguido de um pedido novo
 * (por exemplo, depois de um estorno da baixa no Rodopar) não pode travar nada.
 *
 * Compara com `recebido_em` (relógio do torre), não com `gerado_em` (relógio do
 * coletor, sem fuso). A escolha erra para o lado de PEDIR: se o robô concluiu entre
 * o coletor ler o ERP e o torre receber o snapshot, a barreira não pega. O custo é
 * um rc=4 a mais, que não grava nada no Rodopar — e a A3 segura a repetição.
 *
 * `pedidos` = todos os da chave completa, em qualquer ordem.
 */
export function reprovaDaProvaDoRobo(
  pedidos: readonly PedidoParaBarreira[],
  recebidoEm: Date | null,
): string | null {
  const ultimo = maisRecente(pedidos)
  if (!ultimo || ultimo.rc !== RC_NAO_PENDENTE || !ultimo.concluidoEm) return null
  // Sem recebido_em não há snapshot, e qualquer prova é mais nova que nenhuma leitura.
  if (recebidoEm && ultimo.concluidoEm.getTime() < recebidoEm.getTime()) return null
  return (
    `robô provou no banco às ${horaBrasilia(ultimo.concluidoEm)} que não está pendente ` +
    `(rc=${RC_NAO_PENDENTE}) — snapshot é anterior`
  )
}

/**
 * Quantos pedidos AUTOMÁTICOS desta chave foram criados hoje e terminaram `falhou`.
 *
 * Pedido humano não conta: o disjuntor existe para parar a máquina que repete, não a
 * pessoa que decidiu tentar. "Hoje" é `inicioDoDia`, o mesmo corte do teto diário —
 * duas definições de "hoje" fariam um contar a partir de uma hora e o outro de outra.
 */
export function falhasAutomaticasHoje(
  pedidos: readonly PedidoParaBarreira[],
  inicioDoDia: Date,
): number {
  return pedidos.filter(
    (p) =>
      p.origem !== 'humano' &&
      p.situacao === 'falhou' &&
      p.createdAt.getTime() >= inicioDoDia.getTime(),
  ).length
}

/**
 * A3 — o disjuntor por manifesto.
 *
 * Padrão de 3 falhas, não 1, e o número é medido: o 70319 precisou de três tentativas
 * (rc=12, rc=12, rc=0) — a tela do Rodopar às vezes não é reconhecida de primeira e
 * na terceira vai. Com 1, ele teria ficado de fora; com 3, o laço do 70329 para na
 * terceira volta em vez de gastar o teto do dia.
 *
 * Limite abaixo de 1 vira 1: travar sem nenhuma falha não faz sentido, e o disjuntor
 * não pode ser desligado por variável de ambiente.
 */
export function reprovaDoDisjuntor(
  pedidos: readonly PedidoParaBarreira[],
  inicioDoDia: Date,
  maxFalhasDia: number,
): string | null {
  const limite = Math.max(1, maxFalhasDia)
  const falhas = falhasAutomaticasHoje(pedidos, inicioDoDia)
  if (falhas < limite) return null
  return `${falhas} tentativas automáticas falharam hoje — só pedido humano`
}

/**
 * A2 e A3 juntas, na ordem em que vão para a auditoria. Lista vazia = nada trava.
 *
 * Valem nos DOIS modos. Em sombra elas não impedem nada (nada é enfileirado), mas a
 * avaliação gravada precisa dizer o que o modo real faria — senão a série histórica
 * mediria uma automação diferente da que liga.
 */
export function barreirasDoRobo(
  pedidos: readonly PedidoParaBarreira[],
  ctx: { recebidoEm: Date | null; inicioDoDia: Date; maxFalhasDia: number },
): string[] {
  const reprovas: string[] = []
  const prova = reprovaDaProvaDoRobo(pedidos, ctx.recebidoEm)
  if (prova) reprovas.push(prova)
  const disjuntor = reprovaDoDisjuntor(pedidos, ctx.inicioDoDia, ctx.maxFalhasDia)
  if (disjuntor) reprovas.push(disjuntor)
  return reprovas
}
