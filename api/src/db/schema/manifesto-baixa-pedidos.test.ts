import { describe, expect, it } from 'bun:test'

import { RC_EXIGE_CONFERENCIA, situacaoDoResultado } from './manifesto-baixa-pedidos'

// A regra que `registrarResultado` aplica ao que o robô devolve. O caso que motivou o
// teste e o rc=17 (serie ambigua, 31/10/2026, manifesto 6642): tem que terminar `falhou`,
// e NAO `conferencia` — o robo sai antes de abrir o navegador, nao ha o que conferir.

describe('situacaoDoResultado', () => {
  it('rc=0 conclui', () => {
    expect(situacaoDoResultado(0)).toBe('concluido')
    expect(situacaoDoResultado(0, true)).toBe('concluido')
  })

  it('rc 6 e 11 exigem conferencia, mesmo sem efetuar_clicado', () => {
    for (const rc of RC_EXIGE_CONFERENCIA) {
      expect(situacaoDoResultado(rc)).toBe('conferencia')
      expect(situacaoDoResultado(rc, false)).toBe('conferencia')
    }
  })

  it('rc=17 (serie ambigua) falha — nao e conferencia', () => {
    expect(situacaoDoResultado(17)).toBe('falhou')
    expect(situacaoDoResultado(17, false)).toBe('falhou')
    expect(situacaoDoResultado(17, null)).toBe('falhou')
    expect((RC_EXIGE_CONFERENCIA as readonly number[]).includes(17)).toBe(false)
  })

  it('rc=4 (nao pendente) tambem falha', () => {
    expect(situacaoDoResultado(4, false)).toBe('falhou')
  })

  it('efetuar_clicado=true com rc diferente de 0 trava em conferencia, mesmo fora da lista', () => {
    // preferimos travar um documento a duplicar um lancamento — vale ate para o rc=17
    expect(situacaoDoResultado(12, true)).toBe('conferencia')
    expect(situacaoDoResultado(17, true)).toBe('conferencia')
  })

  it('efetuar_clicado ausente ou null nao promove nada (robo antigo)', () => {
    expect(situacaoDoResultado(12)).toBe('falhou')
    expect(situacaoDoResultado(12, null)).toBe('falhou')
  })
})
