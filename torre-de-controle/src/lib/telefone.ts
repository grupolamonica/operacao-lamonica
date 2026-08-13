// Normalização de telefone brasileiro.
//
// ⚠️ ESPELHA digitosFone()/foneValido() de
// api/src/modules/manifesto/motorista-fones.service.ts. Se as duas divergirem, o número que o
// operador cadastra não casa com o que vem do Rodopar e o MESMO telefone aparece duas vezes na
// tela (um riscado, outro não). Mesmo contrato de normalizarSerie ↔ chaveTratativa.
//
// Também conserta um bug real: a tela montava o href como
//   `tel:+55${numero.replace(/\D/g,'')}`
// e o Rodopar entrega "(081)98633-6617", então saía `tel:+55081986336617` — 13 dígitos com o
// ZERO do DDD, número inválido. Medido: 100% dos telefones do snapshot vêm nesse formato, ou
// seja, todos os links de discagem da tela estavam errados.

/**
 * Forma canônica: DDD + número, sem +55 e sem o zero do DDD.
 *
 * ⚠️ A ORDEM IMPORTA — cortar o país ANTES do zero do DDD. O DDD 55 existe (Santa Maria/RS):
 * '55999998888' (11 dígitos) é celular de lá e não pode perder o 55; '5555999998888' (13) é o
 * mesmo número com país. Por isso o corte do '55' exige comprimento 12 ou 13.
 */
export function digitosFone(numero?: string | null): string {
  let d = String(numero ?? '').replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    d = d.slice(2)
  } else if (d.startsWith('0') && (d.length === 11 || d.length === 12)) {
    d = d.replace(/^0+/, '')
  }
  return d.slice(0, 20)
}

/** Só 10 (fixo) ou 11 (celular) dígitos formam DDD + número discável. */
export function foneValido(digitos: string): boolean {
  return digitos.length === 10 || digitos.length === 11
}

/**
 * href de discagem. Só acrescenta +55 quando o canônico tem 10/11 dígitos — para um número fora
 * do padrão (ramal, truncado) devolve os dígitos crus em vez de inventar um E.164 errado.
 */
export function telHref(numero?: string | null): string {
  const d = digitosFone(numero)
  return foneValido(d) ? `tel:+55${d}` : `tel:${d}`
}
