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
 * Quatro barreiras, cada uma fecha um buraco diferente:
 *   A1  snapshot velho  -> NINGUÉM é elegível no ciclo: a leitura do ERP não é de agora
 *   A2  prova do robô   -> rc=4 (não pendente) ou rc=0 (baixou) concluído DEPOIS do snapshot:
 *                          a prova é mais nova que a evidência
 *   A3  disjuntor       -> N falhas automáticas hoje na mesma chave: daí em diante, só pedido humano
 *   A4  série ambígua   -> o último pedido da chave terminou rc=17 (o robô não distingue qual
 *                          documento é o pedido): sem pedido humano mais novo, nunca reenfileira
 * A1 sozinha teria resolvido o 70329. A2 e A3 existem porque o próximo laço não vai
 * ter a mesma causa: a A2 cobre o snapshot fresco que ainda não viu a baixa, e a A3 é
 * o teto de qualquer laço que nenhuma das outras reconheça.
 *
 * ── A4: POR QUE EXISTE (31/10/2026, manifesto 6642, filial 1, série U) ────────────
 *
 * O Rodopar numera o manifesto por SÉRIE: na filial 1 o 6642 existe em quatro documentos
 * (U, ITA, 13 e 5 — só a U está aberta, emitida em 23/10). O robô identificava o manifesto
 * só por número e filial, lia OUTRA série (já Baixada) e saía com rc=4 em 6 s. A baixa
 * automática o enfileirou em 28/10 às 03:29, 03:38 e 03:48 — três voltas de um laço que a
 * A2 não pega: o snapshot é fresco e segue listando o 6642 aberto (a prova do robô é
 * ANTERIOR a ele), e a A3 só para na terceira. Em 60 dias, 506 de 1.402 manifestos emitidos
 * eram de série cujo número se repete em outra série da mesma filial (U 104 de 104).
 *
 * O robô novo recusa com rc=17 antes de abrir o navegador, quando não consegue provar qual
 * documento é o pedido. rc=17 não é "tente de novo": é falta de informação que a próxima
 * volta automática não vai ter — só uma pessoa decide (baixa à mão conferindo a série, ou
 * repete o pedido depois de o robô ser atualizado). Diferente da A2, não há janela de
 * tempo: ela só cai quando existir um pedido mais novo na chave.
 */

/** rc do robô para "não está pendente" — já baixado, cancelado ou inexistente. */
export const RC_NAO_PENDENTE = 4

/**
 * rc do robô para "baixei e o banco confirmou". O pedido termina `concluido` — em
 * `registrarResultado` (baixa.service.ts) rc=0, e só rc=0, vira `concluido`.
 */
export const RC_BAIXOU = 0

/**
 * rc do robô para "o número deste manifesto atende por mais de um documento e não consigo
 * provar qual é o pedido" (31/10/2026). O robô sai ANTES de abrir o navegador e sem clicar
 * em nada, então o pedido termina `falhou` (nunca `conferencia`) e repetir é inofensivo.
 */
export const RC_SERIE_AMBIGUA = 17

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
 * Duas respostas do robô provam isso, e as duas vêm do banco do Rodopar:
 *   rc=4  ele consultou o banco e o manifesto não estava em aberto (o laço do 70329);
 *   rc=0  ele mesmo baixou, e o banco confirmou (`concluido`).
 * Se isso aconteceu depois de o torre receber o snapshot, a evidência do ERP que o
 * snapshot carrega é ANTERIOR à prova — e pedir de novo é perguntar de novo uma coisa
 * já respondida.
 *
 * O rc=0 entrou na revisão de 13/10, e o buraco que ele fecha é o mais comum dos dois:
 * entre o robô baixar e o próximo snapshot chegar, a lista ainda mostra o manifesto
 * aberto — e a A1 só reprova acima de 15 min, então um snapshot de 7–15 min passa por
 * ela. `concluido` não está no índice de pedido ativo, e nada no banco impede o pedido
 * novo: sem esta regra, o ciclo seguinte enfileiraria de novo o manifesto que o robô
 * acabou de baixar, e ele gastaria uma volta (e uma vaga do teto) para responder rc=4.
 *
 * Só o pedido MAIS RECENTE da chave decide: uma prova antiga seguida de um pedido novo
 * (por exemplo, depois de um estorno da baixa no Rodopar) não pode travar nada — vale
 * para o rc=4 e para o rc=0.
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
  if (!ultimo || !ultimo.concluidoEm) return null
  // `concluido` E rc=0, as duas: uma sem a outra não é o desfecho que o robô reporta
  // quando baixa, e dado inconsistente não pode virar prova.
  const baixou = ultimo.situacao === 'concluido' && ultimo.rc === RC_BAIXOU
  const naoPendente = ultimo.rc === RC_NAO_PENDENTE
  if (!baixou && !naoPendente) return null
  // Sem recebido_em não há snapshot, e qualquer prova é mais nova que nenhuma leitura.
  if (recebidoEm && ultimo.concluidoEm.getTime() < recebidoEm.getTime()) return null
  const hora = horaBrasilia(ultimo.concluidoEm)
  // Reprovas diferentes de propósito: "baixou" e "provou que não está pendente" são
  // fatos diferentes, e a auditoria não pode chamar de baixa do robô o que foi baixa
  // do AGENDADOR (o caso do 70329, que é rc=4).
  return baixou
    ? `robô baixou às ${hora} (rc=${RC_BAIXOU}) — snapshot é anterior`
    : `robô provou no banco às ${hora} que não está pendente (rc=${RC_NAO_PENDENTE}) — snapshot é anterior`
}

/**
 * A4 — o robô já disse que não distingue a série deste manifesto?
 *
 * Só o pedido MAIS RECENTE da chave completa decide, de qualquer origem: um pedido humano
 * mais novo (na fila, ou terminado com outro rc) tira a trava, porque é uma pessoa tentando
 * de novo — talvez com o robô já atualizado, que passa a série e resolve. Se esse pedido
 * humano TAMBÉM terminar rc=17, ele é o mais recente e a trava volta: o robô continua
 * sem distinguir, e a máquina não deve insistir onde a pessoa acabou de falhar.
 *
 * Sem janela de tempo, de propósito (a A2 tem, porque a prova dela envelhece junto com o
 * snapshot). A ambiguidade de série é propriedade do manifesto, não do instante: o 6642
 * continuará com quatro documentos amanhã. Também não exige `concluidoEm` nem `situacao`:
 * o rc só é gravado por `registrarResultado`, e um rc=17 que a pessoa liberou da conferência
 * continua sendo um rc=17.
 *
 * `pedidos` = todos os da chave completa (codman|filial|serie), em qualquer ordem.
 */
export function reprovaDaSerieAmbigua(pedidos: readonly PedidoParaBarreira[]): string | null {
  const ultimo = maisRecente(pedidos)
  if (!ultimo || ultimo.rc !== RC_SERIE_AMBIGUA) return null
  return `robô não distingue a série deste manifesto (rc=${RC_SERIE_AMBIGUA}) — só pedido humano`
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
 * A2, A4 e A3 juntas, na ordem em que vão para a auditoria: as que reconhecem uma causa
 * (a prova do robô, a série ambígua) antes do disjuntor, que é o teto genérico. A2 e A4
 * nunca falam juntas — as duas olham o pedido mais recente, e ele termina em rc=4/0 ou
 * em rc=17, não nos dois. Lista vazia = nada trava.
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
  const serieAmbigua = reprovaDaSerieAmbigua(pedidos)
  if (serieAmbigua) reprovas.push(serieAmbigua)
  const disjuntor = reprovaDoDisjuntor(pedidos, ctx.inicioDoDia, ctx.maxFalhasDia)
  if (disjuntor) reprovas.push(disjuntor)
  return reprovas
}
