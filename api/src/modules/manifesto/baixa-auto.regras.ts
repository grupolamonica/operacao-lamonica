/**
 * F2 — as regras da baixa automática. PURAS: sem I/O, sem relógio, sem banco.
 * Quem busca as fontes é `baixa-auto.fontes.ts`; quem orquestra é o job.
 *
 * A REGRA APROVADA (Danilo, 28/08): status TERMINAL no sistema do CLIENTE, com
 * carimbo de hora. Nada além disso — nem "em viagem com entrega carimbada", nem
 * permanência, nem inferência.
 *
 *   SPX/Shopee      Status Operacional = 'DESCARREGADO' e 'ETA DESTINO REAL' preenchido
 *   Nestlé/Galileu  codstatembarque = 3 (FINALIZADO) e entrega_dtahrfim preenchido
 *
 * POR QUE ISSO É EVIDÊNCIA E NÃO DECLARAÇÃO: o status não é digitado por ninguém
 * da casa — vem do portal do próprio cliente, e vem com carimbo. Medido em 28/08:
 * `Status = Completed` ⟺ `ETA DESTINO REAL` preenchido em 1042 de 1043 linhas, e
 * zero linhas com o carimbo sem o status. É fato de terceiro com relógio.
 *
 * O LASTRO: backtest de 1.246 manifestos SPX baixados em 55 dias — a baixa humana
 * veio ANTES do sinal do cliente em 1 caso (0,1%, por 36 min, dentro do ruído de
 * relógio). Mediana de folga: 31,5 h. Na Nestlé a folga é de 3 h, e o ganho é de
 * volume (~7,8 baixas/dia), não de tempo.
 *
 * O QUE ESTE MÓDULO NÃO FAZ: não decide se PODE agir. Teto diário, kill switch,
 * posto de automação e frescor da fonte são do orquestrador — aqui só se responde
 * "a evidência do cliente sustenta a baixa deste manifesto?".
 */

export type RegraBaixa = 'spx_descarregado' | 'galileu_finalizado'

/** O que o cliente afirma, já normalizado. É o que vai para a auditoria. */
export interface EvidenciaCliente {
  regra: RegraBaixa
  /** status LITERAL do cliente — guardado como veio, não como conclusão */
  status: string
  /** carimbo de hora do fato (ISO). Sem ele não há evidência, só rótulo. */
  carimbo: string | null
  /** cidade de entrega segundo o cliente */
  destino: string
  motorista?: string
  carreta?: string
}

export interface Avaliacao {
  elegivel: boolean
  regra: RegraBaixa | null
  reprovas: string[]
  evidencia: EvidenciaCliente | null
}

/** Linha da aba ASP do SPX, achatada (ver asp.adapter.ts). */
export interface LinhaSpx {
  'LH Trip Number'?: string
  Status?: string
  'Status Operacional'?: string
  'ETA DESTINO REAL'?: string
  Station_Destino?: string
  'Vehicle Plate Number'?: string
  [k: string]: unknown
}

/** Embarque do Galileu (nestle_embarques), já resolvido a partir do grupos_id. */
export interface EmbarqueGalileu {
  codembarque?: string
  codstatembarque?: string | number | null
  descrstatembarque?: string | null
  entrega_dtahrfim?: string | null
  entrega_dtahrchegada?: string | null
  entrega_cidade?: string | null
  mot1_nome?: string | null
  placacarreta?: string | null
}

/** O que o coletor mandou sobre a referência (ver ReferenciaClienteSchema). */
export interface ReferenciaDoManifesto {
  valor?: string | null
  formato?: string | null
  guardas_erp_ok?: boolean | null
  guardas_reprovadas?: string[] | null
  local_entrega_cte?: string | null
}

/** O manifesto, na parte que as regras usam. */
export interface ManifestoParaAvaliar {
  referencia_cliente?: ReferenciaDoManifesto | null
  motorista?: string
  carreta?: string
}

const COD_FINALIZADO = 3

/** Combinantes que o NFKD solta (acentos). Escapes explicitos: o range literal
 *  sao caracteres invisiveis no fonte, e qualquer editor pode comer. */
const DIACRITICOS = /\p{M}/gu

/** Comparação tolerante a acento, caixa, pontuação e padding. */
export function normalizar(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(DIACRITICOS, '') // marcas de acento soltas pelo NFD
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/**
 * Cidades batem? Compara só o primeiro segmento porque os dois lados escrevem
 * diferente: o CTe diz `FEIRA DE SANTANA`, o Galileu diz `FEIRA DE SANTANA/BA/BRA`.
 * Ausência de um dos lados NÃO é igualdade — é falta de informação, e reprova.
 */
export function mesmaCidade(a: unknown, b: unknown): boolean {
  const ca = normalizar(String(a ?? '').split('/')[0])
  const cb = normalizar(String(b ?? '').split('/')[0])
  return Boolean(ca) && ca === cb
}

/**
 * A identidade do veículo/motorista confere entre Rodopar e cliente?
 *
 * MOTORISTA **OU** CARRETA, não os dois. Medido em 120 dias sobre 523 embarques
 * FINALIZADO com carimbo: 76 tinham um dos dois divergindo — e NENHUM virou
 * manifesto cancelado. É troca de carreta e substituição de motorista no meio da
 * viagem, rotina de operação. Exigir os dois entrega 85% de cobertura; exigir um
 * entrega 99%. Só o caso em que os DOIS divergem (1 em 120 dias) indica registro
 * apontando para outra viagem.
 *
 * Campo vazio de um lado não conta como divergência nem como conferência: ele
 * simplesmente não opina, e a decisão fica com o outro campo.
 */
export function identidadeConfere(
  manifesto: { motorista?: string; carreta?: string },
  cliente: { motorista?: string; carreta?: string },
): { ok: boolean; detalhe: string } {
  const mm = normalizar(manifesto.motorista)
  const mc = normalizar(cliente.motorista)
  const cm = normalizar(manifesto.carreta)
  const cc = normalizar(cliente.carreta)

  const motoristaOpina = Boolean(mm && mc)
  const carretaOpina = Boolean(cm && cc)
  const motoristaOk = motoristaOpina && mm === mc
  const carretaOk = carretaOpina && cm === cc

  if (motoristaOk && carretaOk) return { ok: true, detalhe: 'motorista+carreta' }
  if (motoristaOk) return { ok: true, detalhe: 'só motorista' }
  if (carretaOk) return { ok: true, detalhe: 'só carreta' }
  if (!motoristaOpina && !carretaOpina) {
    // nenhum dos dois lados tem o dado: não há o que conferir, e "não pude
    // conferir" não pode virar "conferi"
    return { ok: false, detalhe: 'sem dado para conferir identidade' }
  }
  return { ok: false, detalhe: 'motorista e carreta divergem' }
}

/** A referência passou nas guardas do ERP e é da família esperada? */
function referenciaUtilizavel(ref: ReferenciaDoManifesto | null | undefined, familia: string): string[] {
  const reprovas: string[] = []
  if (!ref?.valor) {
    reprovas.push('sem referência do cliente')
    return reprovas
  }
  if (ref.guardas_erp_ok !== true) {
    // repete o motivo do coletor em vez de dizer só "reprovou": quem lê a
    // auditoria seis meses depois não tem o snapshot original à mão
    const detalhe = (ref.guardas_reprovadas ?? []).join(' · ')
    reprovas.push(detalhe ? `guardas do ERP: ${detalhe}` : 'guardas do ERP reprovaram')
  }
  if (ref.formato !== familia) {
    reprovas.push(`referência não é da família ${familia}`)
  }
  return reprovas
}

/**
 * SPX/Shopee. `linhas` são TODAS as linhas da aba ASP com aquele LH — mais de uma
 * significa ambiguidade e reprova: duas viagens com o mesmo código não deixam
 * saber a qual delas o status se refere.
 */
export function avaliarSpx(manifesto: ManifestoParaAvaliar, linhas: LinhaSpx[]): Avaliacao {
  const ref = manifesto.referencia_cliente
  const reprovas = referenciaUtilizavel(ref, 'LT')

  if (!linhas.length) {
    // Ausência de linha NUNCA é evidência. Pode ser viagem fora da janela, pode ser
    // aba que falhou — e o orquestrador já barrou o ciclo se a fonte estava
    // degradada. Aqui só se registra que não há o que afirmar.
    reprovas.push('LH não encontrado na aba ASP')
    return { elegivel: false, regra: null, reprovas, evidencia: null }
  }
  if (linhas.length > 1) {
    reprovas.push(`${linhas.length} viagens com o mesmo LH`)
    return { elegivel: false, regra: null, reprovas, evidencia: null }
  }

  const linha = linhas[0]
  const status = String(linha['Status Operacional'] ?? '').trim().toUpperCase()
  const carimbo = String(linha['ETA DESTINO REAL'] ?? '').trim()

  if (status !== 'DESCARREGADO') reprovas.push(`status do cliente: ${status || '(vazio)'}`)
  // O carimbo é o que separa fato de rótulo. Medido: 1042/1043 DESCARREGADO têm
  // ETA DESTINO REAL, e zero linhas têm o carimbo sem o status — quando os dois
  // discordam, algo mudou na fonte e não se age.
  if (!carimbo) reprovas.push('sem carimbo de entrega (ETA DESTINO REAL)')

  const evidencia: EvidenciaCliente = {
    regra: 'spx_descarregado',
    status,
    carimbo: carimbo || null,
    destino: String(linha.Station_Destino ?? ''),
    carreta: String(linha['Vehicle Plate Number'] ?? ''),
  }
  return { elegivel: reprovas.length === 0, regra: reprovas.length ? null : 'spx_descarregado', reprovas, evidencia }
}

/**
 * Nestlé/Galileu. `embarques` são os embarques distintos resolvidos a partir do
 * grupos_id (via nestle_ofertas.codembarque) — mais de um reprova.
 *
 * Além do status, a Nestlé exige DESTINO e IDENTIDADE. O motivo é medido: o
 * Galileu já apareceu com a carreta de outro veículo no embarque (manifesto 69602,
 * 28/08), e o destino é a checagem mais barata de que a entrega carimbada é a
 * deste CTe e não de outra perna.
 */
export function avaliarGalileu(
  manifesto: ManifestoParaAvaliar,
  embarques: EmbarqueGalileu[],
): Avaliacao {
  const ref = manifesto.referencia_cliente
  const reprovas = referenciaUtilizavel(ref, 'B1')

  if (!embarques.length) {
    reprovas.push('carga não encontrada no Galileu')
    return { elegivel: false, regra: null, reprovas, evidencia: null }
  }
  if (embarques.length > 1) {
    reprovas.push(`carga em ${embarques.length} embarques`)
    return { elegivel: false, regra: null, reprovas, evidencia: null }
  }

  const e = embarques[0]
  const descr = String(e.descrstatembarque ?? '').trim()
  const cod = Number.parseInt(String(e.codstatembarque ?? '').trim(), 10)
  const fim = String(e.entrega_dtahrfim ?? '').trim()

  // Comparar pelo CÓDIGO, nunca pelo texto: o código 6 tem quatro redações
  // diferentes em produção ('PENDENTE FINALIZACAO', 'PENDENTE DE VINCULO (...)',
  // 'PENDENTE DE DEV. (...)', 'DEV. PENDENTE DE APROVAÇÃO (...)'), e uma regra
  // por texto nasce quebrada no dia em que aparecer a quinta.
  if (cod !== COD_FINALIZADO) reprovas.push(`status do cliente: ${descr || '(vazio)'}`)
  if (!fim) reprovas.push('sem fim de entrega carimbado')

  if (!mesmaCidade(ref?.local_entrega_cte, e.entrega_cidade)) {
    reprovas.push(`destino do CTe (${ref?.local_entrega_cte || '—'}) não bate com a entrega (${e.entrega_cidade || '—'})`)
  }

  const identidade = identidadeConfere(
    { motorista: manifesto.motorista, carreta: manifesto.carreta },
    { motorista: e.mot1_nome ?? '', carreta: e.placacarreta ?? '' },
  )
  if (!identidade.ok) reprovas.push(identidade.detalhe)

  const evidencia: EvidenciaCliente = {
    regra: 'galileu_finalizado',
    status: descr,
    carimbo: fim || null,
    destino: String(e.entrega_cidade ?? ''),
    motorista: String(e.mot1_nome ?? ''),
    carreta: String(e.placacarreta ?? ''),
  }
  return { elegivel: reprovas.length === 0, regra: reprovas.length ? null : 'galileu_finalizado', reprovas, evidencia }
}

/**
 * Despacha pela família da referência. Família sem portal ('outro') não é erro —
 * é cliente que usa a coluna para controle interno dele (REMESSA:, REVERSA). Só
 * não há onde conferir, e a automação não opina.
 */
export function avaliar(
  manifesto: ManifestoParaAvaliar,
  fontes: { spx: LinhaSpx[]; galileu: EmbarqueGalileu[] },
): Avaliacao {
  const formato = manifesto.referencia_cliente?.formato
  if (formato === 'LT') return avaliarSpx(manifesto, fontes.spx)
  if (formato === 'B1') return avaliarGalileu(manifesto, fontes.galileu)
  return {
    elegivel: false,
    regra: null,
    reprovas: [formato ? 'família sem portal correspondente' : 'sem referência do cliente'],
    evidencia: null,
  }
}

/**
 * Ordem em que os elegíveis devem ser enfileirados: mais tempo aberto primeiro.
 *
 * NÃO É COSMÉTICO. A fila do robô é servida por `createdAt` ASC, e o job cria
 * todos os pedidos de um ciclo no mesmo instante — sem ordenar aqui, a ordem vira
 * a da iteração e o manifesto de 214 h não teria prioridade sobre o de 9 h. Com
 * uma máquina drenando ~10 baixas/hora, o primeiro sai no minuto 6 e o décimo
 * quinto no minuto 90.
 */
export function ordenarParaFila<T extends { horas_aberto?: number | null }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => (b.horas_aberto ?? 0) - (a.horas_aberto ?? 0))
}
