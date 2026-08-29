import { describe, expect, it } from 'bun:test'

import {
  assumirPosto,
  largarPosto,
  postoAtual,
  renovarPosto,
  type RedisPosto,
} from './baixa-auto.posto'

/**
 * O posto é uma primitiva de exclusão mútua: uma máquina por vez executa a baixa
 * automática. Exclusão mútua que nunca viu duas máquinas competindo é promessa, não
 * garantia — daí este arquivo.
 *
 * O fake abaixo implementa a semântica do `SET ... NX` de verdade (só grava se a
 * chave não existir), porque é exatamente ela que sustenta o desenho.
 */
function redisFake(inicial: string | null = null) {
  let valor = inicial
  const chamadas = { get: 0, set: 0, del: 0 }
  const r: RedisPosto = {
    async get() {
      chamadas.get += 1
      return valor
    },
    async set(_c, v, _ex, _ttl, nx) {
      chamadas.set += 1
      if (nx === 'NX' && valor !== null) return null // semântica do NX
      valor = v
      return 'OK'
    },
    async del() {
      chamadas.del += 1
      valor = null
      return 1
    },
  }
  return { r, chamadas, atual: () => valor }
}

const quebrado: RedisPosto = {
  async get() { throw new Error('ECONNREFUSED') },
  async set() { throw new Error('ECONNREFUSED') },
  async del() { throw new Error('ECONNREFUSED') },
}

describe('assumir o posto', () => {
  it('máquina livre assume', async () => {
    const { r } = redisFake()
    const res = await assumirPosto('ORION-05', 'user-1', 'Filipe', r)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.posto.agente).toBe('ORION-05')
      expect(res.posto.user_id).toBe('user-1')
    }
  })

  it('segunda máquina NÃO assume e vê quem está lá', async () => {
    // a corrida real: duas pessoas clicando ao mesmo tempo. Nenhuma checagem em
    // código sobrevive a isso; o NX sim.
    const { r } = redisFake()
    await assumirPosto('ORION-05', 'user-1', 'Filipe', r)
    const res = await assumirPosto('ORION-09', 'user-2', 'Marcio', r)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.posto?.agente).toBe('ORION-05')
      expect(res.motivo).toContain('ORION-05')
      expect(res.motivo).toContain('Filipe')
    }
  })

  it('o dono reativando é idempotente e mantém o "desde"', async () => {
    // duplo clique ou refresh da tela não é erro, e responder "já está ativo em você
    // mesmo" seria uma mensagem de erro para uma situação que não é erro
    const { r } = redisFake()
    const um = await assumirPosto('ORION-05', 'user-1', 'Filipe', r)
    const dois = await assumirPosto('ORION-05', 'user-1', 'Filipe', r)
    expect(dois.ok).toBe(true)
    if (um.ok && dois.ok) expect(dois.posto.desde).toBe(um.posto.desde)
  })

  it('Redis fora falha FECHADO', async () => {
    // sem posto o job não enfileira. Falhar fechado aqui é a diferença entre não
    // automatizar e automatizar sem controle.
    const res = await assumirPosto('ORION-05', 'user-1', null, quebrado)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.motivo).toContain('Redis')
  })
})

describe('renovar', () => {
  it('o dono renova', async () => {
    const { r, chamadas } = redisFake()
    await assumirPosto('ORION-05', 'user-1', null, r)
    const antes = chamadas.set
    await renovarPosto('ORION-05', r)
    expect(chamadas.set).toBe(antes + 1)
  })

  it('quem não é dono NÃO renova — e não é erro', async () => {
    // o agente que não tem o posto bate igual, porque continua pegando pedido humano
    const { r, chamadas } = redisFake()
    await assumirPosto('ORION-05', 'user-1', null, r)
    const antes = chamadas.set
    await renovarPosto('ORION-09', r)
    expect(chamadas.set).toBe(antes)
  })

  it('Redis fora não lança', async () => {
    await renovarPosto('ORION-05', quebrado)
  })
})

describe('largar', () => {
  it('o dono larga e o posto fica livre', async () => {
    const { r, atual } = redisFake()
    await assumirPosto('ORION-05', 'user-1', null, r)
    expect((await largarPosto('ORION-05', r)).ok).toBe(true)
    expect(atual()).toBeNull()
    expect(await postoAtual(r)).toBeNull()
  })

  it('outra máquina NÃO consegue largar', async () => {
    // sem isto, um operador desligaria a automação da máquina de outro sem perceber,
    // e o único sinal seria a fila parando
    const { r, atual } = redisFake()
    await assumirPosto('ORION-05', 'user-1', null, r)
    const res = await largarPosto('ORION-09', r)
    expect(res.ok).toBe(false)
    expect(atual()).not.toBeNull()
  })

  it('largar posto vazio é sucesso, não erro', async () => {
    const { r } = redisFake()
    expect((await largarPosto('ORION-05', r)).ok).toBe(true)
  })
})

describe('postoAtual', () => {
  it('valor corrompido vira null em vez de explodir', async () => {
    const { r } = redisFake('{isto nao e json')
    expect(await postoAtual(r)).toBeNull()
  })

  it('Redis fora vira null — leitura de apoio nunca derruba a tela', async () => {
    expect(await postoAtual(quebrado)).toBeNull()
  })
})
