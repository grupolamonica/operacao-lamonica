import { describe, it, expect } from 'bun:test'
import {
  calcularHorasViagemComRegulamentacao,
  calcularAdiantamentoHoras,
  formatarAdiantamento,
} from './regulamentacao'

describe('regulamentacao (lei do motorista)', () => {
  it('60km ~= 1h de condução pura (60 km/h, dentro de 1 jornada, sem pausas)', () => {
    expect(calcularHorasViagemComRegulamentacao(60)).toBeCloseTo(1.0, 1)
  })

  it('1300km excede jornadas → soma descansos (> condução pura de 20h)', () => {
    const h = calcularHorasViagemComRegulamentacao(1300)
    expect(h).toBeGreaterThan(20)
  })

  it('velocidade 0 → Infinity (guarda)', () => {
    expect(calcularHorasViagemComRegulamentacao(100, {
      velocidadeMedia: 0, limiteConducaoContinua: 5.5, pausaMinimaContinua: 0.5,
      jornadaDiariaConducao: 8, descansoInterJornada: 11, kmParaConsiderarChegou: 2,
    })).toBe(Infinity)
  })

  it('adiantamento: 0km restante e prazo +2h → +2h', () => {
    const a = calcularAdiantamentoHoras(0, new Date('2026-06-03T20:00:00Z'), new Date('2026-06-03T18:00:00Z'))
    expect(a).toBeCloseTo(2, 1)
  })

  it('sem prazo → null', () => {
    expect(calcularAdiantamentoHoras(100, null, new Date())).toBeNull()
  })

  it('formata "+HH:MM" / "-HH:MM"', () => {
    expect(formatarAdiantamento(2.5)).toBe('+02:30')
    expect(formatarAdiantamento(-1.25)).toBe('-01:15')
    expect(formatarAdiantamento(0)).toBe('+00:00')
    expect(formatarAdiantamento(null)).toBe('')
  })
})
