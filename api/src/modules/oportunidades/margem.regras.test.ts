import { describe, expect, it } from 'bun:test'

import { mediana, montarMemoria, normalizarLocal } from './margem.regras'

// A margem alimenta decisão comercial (aceitar ou recusar uma carga). O que estes
// testes protegem não é o arredondamento — é a regra de que SEM INSUMO NÃO SAI NÚMERO.

describe('normalizarLocal', () => {
  it('iguala as grafias que a operação usa para a mesma cidade', () => {
    const esperado = 'SALVADOR BA'
    expect(normalizarLocal('Salvador/BA')).toBe(esperado)
    expect(normalizarLocal('salvador - ba')).toBe(esperado)
    expect(normalizarLocal('  SALVADOR   BA  ')).toBe(esperado)
    expect(normalizarLocal('Salvador, BA')).toBe(esperado)
  })

  it('remove acento — senão São Paulo nunca casa com SAO PAULO', () => {
    expect(normalizarLocal('São Paulo/SP')).toBe('SAO PAULO SP')
    expect(normalizarLocal('SAO PAULO SP')).toBe('SAO PAULO SP')
    expect(normalizarLocal('Ribeirão Preto')).toBe('RIBEIRAO PRETO')
    expect(normalizarLocal('Goiânia')).toBe('GOIANIA')
  })

  it('devolve string vazia para ausente — o chamador não calcula distância sem rota', () => {
    expect(normalizarLocal(null)).toBe('')
    expect(normalizarLocal(undefined)).toBe('')
    expect(normalizarLocal('   ')).toBe('')
    expect(normalizarLocal('///')).toBe('')
  })
})

describe('mediana', () => {
  it('usa o valor central em quantidade ímpar', () => {
    expect(mediana([100, 300, 200])).toBe(200)
  })

  it('usa a média dos dois centrais em quantidade par', () => {
    expect(mediana([100, 200, 300, 400])).toBe(250)
  })

  it('descarta zero, negativo e não-numérico — distância assim é sujeira de sync', () => {
    expect(mediana([0, -50, Number.NaN, 400])).toBe(400)
  })

  it('lista vazia devolve null, não zero', () => {
    // zero passaria pelo gate de "tem distância" e produziria margem = frete inteiro.
    expect(mediana([])).toBeNull()
    expect(mediana([0, -1])).toBeNull()
  })
})

describe('montarMemoria', () => {
  const completo = {
    frete: 10_000,
    distanciaKm: 800,
    distanciaFonte: 'historico_viagens' as const,
    distanciaAmostras: 12,
    custoKm: 9.5,
    custoVigenciaInicio: '2026-08-01',
    custoFonteNota: 'DRE_TERCEIROS ago/26',
  }

  it('calcula margem e percentual do caso completo', () => {
    const m = montarMemoria(completo)
    expect(m.calculavel).toBe(true)
    // 800 km x R$ 9,50 = R$ 7.600 -> margem 2.400 sobre 10.000 = 24%
    expect(m.custo_total).toBe(7_600)
    expect(m.margem_valor).toBe(2_400)
    expect(m.margem_percentual).toBe(24)
    expect(m.versao).toBe('v1')
  })

  it('aceita margem negativa — recusar a carga é uma resposta legítima', () => {
    const m = montarMemoria({ ...completo, frete: 5_000 })
    expect(m.calculavel).toBe(true)
    expect(m.margem_valor).toBe(-2_600)
    expect(m.margem_percentual).toBe(-52)
  })

  it('sem distância não calcula e diz o que falta', () => {
    const m = montarMemoria({ ...completo, distanciaKm: null, distanciaFonte: null, distanciaAmostras: 0 })
    expect(m.calculavel).toBe(false)
    expect(m.margem_valor).toBeNull()
    expect(m.motivo).toContain('distância')
  })

  it('sem custo/km vigente não calcula e diz o que falta', () => {
    const m = montarMemoria({ ...completo, custoKm: null, custoVigenciaInicio: null })
    expect(m.calculavel).toBe(false)
    expect(m.margem_valor).toBeNull()
    expect(m.motivo).toContain('custo')
  })

  it('frete ausente ou zero não calcula — evita dividir por zero no percentual', () => {
    expect(montarMemoria({ ...completo, frete: 0 }).calculavel).toBe(false)
    expect(montarMemoria({ ...completo, frete: Number.NaN }).calculavel).toBe(false)
  })

  it('distância zero não passa como se fosse rota conhecida', () => {
    // Sem este gate a margem sairia igual ao frete inteiro — o pior erro possível
    // aqui, porque parece um negócio excelente.
    const m = montarMemoria({ ...completo, distanciaKm: 0 })
    expect(m.calculavel).toBe(false)
    expect(m.margem_valor).toBeNull()
  })

  it('preserva os insumos na memória mesmo quando não calcula', () => {
    // A tela precisa mostrar o que TINHA para o usuário entender o que falta.
    const m = montarMemoria({ ...completo, custoKm: null })
    expect(m.distancia_km).toBe(800)
    expect(m.distancia_amostras).toBe(12)
    expect(m.distancia_fonte).toBe('historico_viagens')
  })

  it('a memória lista os componentes na ordem do cálculo', () => {
    const m = montarMemoria(completo)
    expect(m.componentes.map((c) => c.sinal)).toEqual(['+', '-', '='])
    expect(m.componentes[1]?.detalhe).toContain('km')
    expect(m.custo_fonte_nota).toBe('DRE_TERCEIROS ago/26')
  })

  it('arredonda em centavos, sem acumular ponto flutuante', () => {
    const m = montarMemoria({ ...completo, distanciaKm: 333.33, custoKm: 3.3333 })
    expect(m.custo_total).toBe(1_111.09)
    expect(m.margem_valor).toBe(8_888.91)
  })
})
