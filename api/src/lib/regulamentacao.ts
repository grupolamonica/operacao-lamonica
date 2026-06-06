/**
 * Lei do Motorista — motor de tempo de viagem + adiantamento/atraso.
 * Porte fiel de calcularHorasViagemComRegulamentacao_ / calcularAdiantamentoHoras_
 * do painel operacional Lamonica (ScriptControleViagens.txt). D-12-11 / D-12-16.
 *
 * Usado pelo SLA evaluator e pelos detectores de ocorrência (Wave 6).
 */

export interface RegulamentacaoParams {
  velocidadeMedia: number          // km/h
  limiteConducaoContinua: number   // h dirigindo antes de pausa obrigatória
  pausaMinimaContinua: number      // h de pausa após condução contínua
  jornadaDiariaConducao: number    // h de condução por jornada
  descansoInterJornada: number     // h de descanso entre jornadas
  kmParaConsiderarChegou: number   // km abaixo do qual considera-se chegada
}

// Parâmetros oficiais do painel GAS (aba de config da planilha 1vywBfU, coluna "padrão"):
// Velocidade 60 km/h, Jornada 12h, Pausa contínua vazia (=0), Descanso 11h, KM-chegou 2.
// → teto diário = 60 × 12 = 720 KM/dia (Máx.), idêntico ao painel.
export const PARAMS_PADRAO: RegulamentacaoParams = {
  velocidadeMedia: 60,
  limiteConducaoContinua: 5.5,
  pausaMinimaContinua: 0,
  jornadaDiariaConducao: 12,
  descansoInterJornada: 11,
  kmParaConsiderarChegou: 2,
}

// Regime "regular" (ignorar lei): condução contínua, sem pausa nem descanso inter-jornada.
export const PARAMS_REGULAR: RegulamentacaoParams = {
  ...PARAMS_PADRAO,
  pausaMinimaContinua: 0,
  descansoInterJornada: 0,
}

/**
 * Horas totais (decorridas) para percorrer `km` respeitando pausas e jornadas.
 * Simula condução contínua → pausa, jornada diária → descanso inter-jornada.
 */
export function calcularHorasViagemComRegulamentacao(km: number, params: RegulamentacaoParams = PARAMS_PADRAO): number {
  const { velocidadeMedia, limiteConducaoContinua, pausaMinimaContinua, jornadaDiariaConducao, descansoInterJornada } = params
  if (velocidadeMedia <= 0) return Infinity
  const horasConducaoPura = km / velocidadeMedia
  if (jornadaDiariaConducao <= 0 || limiteConducaoContinua <= 0 ||
      (pausaMinimaContinua === 0 && descansoInterJornada === 0)) {
    return horasConducaoPura
  }

  let tempoTotalDecorrido = 0
  let horasConduzidasNoTotal = 0
  let jornadasCompletasContadas = 0
  let safety = 0
  while (horasConduzidasNoTotal < horasConducaoPura && safety++ < 10000) {
    const restoJornada = jornadaDiariaConducao - (horasConduzidasNoTotal % jornadaDiariaConducao)
    const horasNesteBloco = Math.min(
      horasConducaoPura - horasConduzidasNoTotal,
      limiteConducaoContinua,
      restoJornada,
    )
    if (horasNesteBloco <= 0 || Number.isNaN(horasNesteBloco)) break
    horasConduzidasNoTotal += horasNesteBloco
    tempoTotalDecorrido += horasNesteBloco
    const precisaPausaContinua = horasConduzidasNoTotal < horasConducaoPura && horasNesteBloco === limiteConducaoContinua
    if (precisaPausaContinua) tempoTotalDecorrido += pausaMinimaContinua
    const novasJornadas = Math.floor(horasConduzidasNoTotal / jornadaDiariaConducao)
    if (novasJornadas > jornadasCompletasContadas && horasConduzidasNoTotal < horasConducaoPura) {
      tempoTotalDecorrido += descansoInterJornada
      jornadasCompletasContadas = novasJornadas
    }
  }
  return tempoTotalDecorrido
}

/**
 * Adiantamento em horas (positivo = adiantado, negativo = atrasado).
 * null se não dá pra calcular (sem prazo).
 * @param kmFalta distância restante
 * @param prazo   prazo de entrega (Date)
 * @param agora   instante de referência
 * @param morosidadeHoras atraso acumulado na origem (default 0)
 */
export function calcularAdiantamentoHoras(
  kmFalta: number,
  prazo: Date | null,
  agora: Date,
  morosidadeHoras = 0,
  params: RegulamentacaoParams = PARAMS_PADRAO,
): number | null {
  if (!prazo) return null
  const prazoAjustado = new Date(prazo.getTime() + morosidadeHoras * 3600000)
  if (kmFalta <= params.kmParaConsiderarChegou) {
    return (prazoAjustado.getTime() - agora.getTime()) / 3600000
  }
  const tempoRestante = calcularHorasViagemComRegulamentacao(kmFalta, params)
  if (!Number.isFinite(tempoRestante)) return null
  const chegadaEstimada = new Date(agora.getTime() + tempoRestante * 3600000)
  return (prazoAjustado.getTime() - chegadaEstimada.getTime()) / 3600000
}

/** Formata adiantamento "+HH:MM" / "-HH:MM" (positivo = adiantado). */
export function formatarAdiantamento(horas: number | null): string {
  if (horas == null || Number.isNaN(horas)) return ''
  if (Math.abs(horas) < 0.0167) return '+00:00'
  const sinal = horas >= 0 ? '+' : '-'
  let h = Math.floor(Math.abs(horas))
  let m = Math.round((Math.abs(horas) - h) * 60)
  if (m === 60) { h += 1; m = 0 }
  return `${sinal}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Formata atraso "+HH:MM" / "-HH:MM" com a convenção do painel (positivo = ATRASADO).
 * Numericamente idêntico a formatarAdiantamento; o sinal já vem correto no valor passado
 * (o adapter persiste adiantamento_horas = -calcularAdiantamentoHoras → + = atrasado).
 */
export function formatarAtraso(horas: number | null): string {
  return formatarAdiantamento(horas)
}
