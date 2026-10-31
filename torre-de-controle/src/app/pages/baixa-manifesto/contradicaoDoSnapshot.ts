/**
 * A resposta "não pendente" do robô é contradita pelo ERP? PURO: sem React, sem relógio —
 * os dois instantes chegam como valor. Tem teste (`contradicaoDoSnapshot.test.ts`); a
 * página só decide o rótulo em cima do que isto responde.
 *
 * POR QUE EXISTE (31/10/2026, manifesto 6642, filial 1, série U). A tela passou a mostrar
 * `falhou` + rc=4 com "Baixado" como o botão neutro JÁ BAIXADO (14/10, #133, para o laço do
 * 70329: baixado pelo AGENDADOR, ainda na lista por causa do coletor). Só que o robô lia
 * OUTRA série do 6642 (ITA, já baixada) e respondia rc=4 para um manifesto que seguia ABERTO
 * no Rodopar — e o rótulo, em vez de denunciar o defeito, o escondia por três dias.
 *
 * O SINAL: a lista da tela é o snapshot do coletor, e o coletor lê o ERP. Se o snapshot
 * chegou DEPOIS de o robô responder "não está pendente" e o manifesto ainda está nele, a
 * afirmação do robô está contradita — documento errado (série) ou baixa estornada. Quando o
 * snapshot é ANTERIOR à resposta (o caso do 70329), não há contradição: ele só não viu a
 * baixa ainda, e "JÁ BAIXADO" segue sendo o rótulo certo.
 *
 * Compara `recebido_em` (relógio do torre) com `concluido_em` (também do torre), como a
 * barreira A2 da api faz, e não `gerado_em` (relógio do coletor, sem fuso).
 */

/**
 * Folga entre a resposta do robô e a chegada do snapshot para o snapshot valer como
 * "leitura posterior". O coletor lê o universo do ERP no início do ciclo e só envia ao
 * torre no fim: medido no log do coletor em 31/10 09:33, leitura às 09:33:40 e envio às
 * 09:33:58 (~18 s). Sem folga, um snapshot que chega 5 s depois da resposta do robô — mas
 * foi LIDO antes dela — acusaria uma contradição que não existe. 60 s cobre o atraso medido
 * com sobra, e o custo de errar para esse lado é só o rótulo demorar um ciclo a mudar.
 */
export const MARGEM_LEITURA_ERP_MS = 60_000

/**
 * `Date` além de string porque o Eden Treaty REVIVE strings ISO com fuso em objetos Date
 * (ver a nota em `PedidoBaixa`); `new Date()` aceita os dois.
 */
type Instante = string | Date | null | undefined

function emMs(v: Instante): number | null {
  if (!v) return null
  const ms = (v instanceof Date ? v : new Date(v)).getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * true quando o snapshot foi recebido pelo menos `margemMs` DEPOIS de o pedido terminar —
 * isto é, quando a lista atual é uma leitura do ERP posterior à resposta do robô. Chamar
 * só para manifesto QUE ESTÁ na lista: estar nela é a outra metade da contradição.
 *
 * Instante ausente ou ilegível devolve false: sem os dois lados não há como afirmar
 * contradição, e a tela cai no comportamento de antes (que já avisa, no balão, que o
 * snapshot pode ser anterior).
 */
export function snapshotContradizRobo(
  concluidoEm: Instante,
  snapshotRecebidoEm: Instante,
  margemMs: number = MARGEM_LEITURA_ERP_MS,
): boolean {
  const concluido = emMs(concluidoEm)
  const recebido = emMs(snapshotRecebidoEm)
  if (concluido == null || recebido == null) return false
  return recebido - concluido >= margemMs
}
