/**
 * Lei do motorista — porte client-side (espelha api/src/lib/regulamentacao.ts).
 * Usado para recalcular ETA/atraso AO VIVO a cada tick (5s) na tela, como o painel GAS faz —
 * o operador vê a previsão e o atraso "correndo" em tempo real.
 */
export interface RegParams {
  velocidadeMedia: number
  limiteConducaoContinua: number
  pausaMinimaContinua: number
  jornadaDiariaConducao: number
  descansoInterJornada: number
  kmParaConsiderarChegou: number
}
export const PARAMS_PADRAO: RegParams = {
  velocidadeMedia: 60, limiteConducaoContinua: 5.5, pausaMinimaContinua: 0,
  jornadaDiariaConducao: 12, descansoInterJornada: 11, kmParaConsiderarChegou: 2,
}

/** Horas decorridas para percorrer `km` com pausas/jornadas (igual ao backend). */
export function calcularHorasViagem(km: number, p: RegParams = PARAMS_PADRAO): number {
  const { velocidadeMedia: v, limiteConducaoContinua: lim, pausaMinimaContinua: pau, jornadaDiariaConducao: jor, descansoInterJornada: des } = p
  if (v <= 0) return Infinity
  const pura = km / v
  if (jor <= 0 || lim <= 0 || (pau === 0 && des === 0)) return pura
  let tot = 0, cond = 0, jc = 0, safe = 0
  while (cond < pura && safe++ < 10000) {
    const bloco = Math.min(pura - cond, lim, jor - (cond % jor))
    if (bloco <= 0 || Number.isNaN(bloco)) break
    cond += bloco; tot += bloco
    if (cond < pura && bloco === lim) tot += pau
    const nj = Math.floor(cond / jor)
    if (nj > jc && cond < pura) { tot += des; jc = nj }
  }
  return tot
}

/** Adiantamento em horas (+ = adiantado / − = atrasado). null se sem prazo. */
export function calcularAdiantamento(kmFalta: number, prazo: Date | null, agora: Date, morosidadeHoras = 0, p: RegParams = PARAMS_PADRAO): number | null {
  if (!prazo) return null
  const prazoAj = new Date(prazo.getTime() + morosidadeHoras * 3600000)
  if (kmFalta <= p.kmParaConsiderarChegou) return (prazoAj.getTime() - agora.getTime()) / 3600000
  const tRest = calcularHorasViagem(kmFalta, p)
  if (!Number.isFinite(tRest)) return null
  const chegada = new Date(agora.getTime() + tRest * 3600000)
  return (prazoAj.getTime() - chegada.getTime()) / 3600000
}

/** Formata atraso "+HH:MM" / "−HH:MM" (positivo = atrasado). */
export function formatarAtraso(horas: number | null): string {
  if (horas == null || Number.isNaN(horas)) return '—'
  if (Math.abs(horas) < 0.0167) return '+00:00'
  const sinal = horas >= 0 ? '+' : '-'
  let h = Math.floor(Math.abs(horas)); let m = Math.round((Math.abs(horas) - h) * 60)
  if (m === 60) { h += 1; m = 0 }
  return `${sinal}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Recalcula ETA/atraso/sla AO VIVO para uma viagem ativa, dado `agora`.
 * atrasoHoras: + = atrasado (convenção do painel). Retorna null quando não dá pra computar.
 */
export function recomputeSla(
  kmTotal: number, kmFalta: number, windowEnd: Date | null, windowStart: Date | null, agora: Date,
): { eta: Date | null; atrasoHoras: number | null; slaStatus: 'no_prazo' | 'atrasado' | null } {
  if (!(kmTotal > 0) || !windowEnd || kmFalta <= PARAMS_PADRAO.kmParaConsiderarChegou) {
    return { eta: kmFalta <= PARAMS_PADRAO.kmParaConsiderarChegou ? agora : null, atrasoHoras: null, slaStatus: null }
  }
  const tRest = calcularHorasViagem(kmFalta)
  const eta = Number.isFinite(tRest) ? new Date(agora.getTime() + tRest * 3600000) : null
  const adiant = calcularAdiantamento(kmFalta, windowEnd, agora)
  const atrasoHoras = adiant == null ? null : -adiant
  let slaStatus: 'no_prazo' | 'atrasado' | null = null
  if (windowStart && windowStart > agora) slaStatus = 'no_prazo'
  else if (atrasoHoras != null) slaStatus = atrasoHoras > 0 ? 'atrasado' : 'no_prazo'
  return { eta, atrasoHoras, slaStatus }
}
