import { describe, expect, it } from 'bun:test'

import {
  barreirasDoRobo,
  falhasAutomaticasHoje,
  horaBrasilia,
  reprovaDaProvaDoRobo,
  reprovaDoDisjuntor,
  reprovaDoSnapshot,
  type PedidoParaBarreira,
} from './baixa-auto.barreiras'

// Fixtures com a linha do tempo REAL do manifesto 70329 em 13/10/2026 (horários de
// Brasília, UTC-3): último snapshot do coletor às 12:33, baixa pelo AGENDADOR às 13:10,
// primeira volta do laço às 13:49 — o robô via "Baixado" e saía com rc=4 em segundos.

const brt = (hhmm: string, dia = '2026-10-13') => new Date(`${dia}T${hhmm}:00-03:00`)
const INICIO_DO_DIA = brt('00:00')

const pedido = (over: Partial<PedidoParaBarreira> = {}): PedidoParaBarreira => ({
  origem: 'galileu',
  situacao: 'falhou',
  rc: 4,
  createdAt: brt('13:49'),
  concluidoEm: brt('13:50'),
  ...over,
})

describe('reprovaDoSnapshot (A1)', () => {
  it('snapshot de 250 min reprova — ninguem e elegivel no ciclo', () => {
    // o caso do 70329: coletor sem logar desde 12:38, snapshot das 12:33 ainda na mesa
    const r = reprovaDoSnapshot(250, 15)
    expect(r).toBe('snapshot do coletor com 250 min (limite 15) — sem leitura fresca do ERP')
  })

  it('snapshot de 3 min serve', () => {
    expect(reprovaDoSnapshot(3, 15)).toBeNull()
  })

  it('o limite e o mesmo do aviso da tela: 15 serve, 16 nao', () => {
    // a tela acende "Coletor sem enviar ha N min" com idade_min > 15
    expect(reprovaDoSnapshot(15, 15)).toBeNull()
    expect(reprovaDoSnapshot(16, 15)).not.toBeNull()
  })

  it('sem snapshot nenhum tambem reprova', () => {
    expect(reprovaDoSnapshot(null, 15)).toBe('sem snapshot do coletor — sem leitura do ERP')
  })
})

describe('reprovaDaProvaDoRobo (A2)', () => {
  it('rc=4 concluido DEPOIS do snapshot pula o manifesto', () => {
    // snapshot fresco (13:45) que ainda nao viu a baixa; o robo provou as 13:50
    const r = reprovaDaProvaDoRobo([pedido()], brt('13:45'))
    expect(r).toBe('robô provou no banco às 13:50 que não está pendente (rc=4) — snapshot é anterior')
  })

  it('rc=4 concluido ANTES do snapshot nao pula: o snapshot e mais novo que a prova', () => {
    expect(reprovaDaProvaDoRobo([pedido()], brt('13:55'))).toBeNull()
  })

  it('concluido no mesmo instante do snapshot pula (>=)', () => {
    expect(reprovaDaProvaDoRobo([pedido()], brt('13:50'))).not.toBeNull()
  })

  it('so o pedido MAIS RECENTE decide, em qualquer ordem', () => {
    // rc=4 antigo seguido de um pedido humano novo (ex.: estorno da baixa no Rodopar)
    const antigo = pedido({ createdAt: brt('13:49'), concluidoEm: brt('13:50') })
    const novo = pedido({ origem: 'humano', situacao: 'na_fila', rc: null, createdAt: brt('14:05'), concluidoEm: null })
    expect(reprovaDaProvaDoRobo([novo, antigo], brt('13:45'))).toBeNull()
    expect(reprovaDaProvaDoRobo([antigo, novo], brt('13:45'))).toBeNull()
  })

  it('rc diferente de 4 nao e prova de nada', () => {
    // rc=12 (nao reconheceu a tela) nao diz se o manifesto esta pendente
    expect(reprovaDaProvaDoRobo([pedido({ rc: 12 })], brt('13:45'))).toBeNull()
  })

  it('sem pedido nenhum nao trava', () => {
    expect(reprovaDaProvaDoRobo([], brt('13:45'))).toBeNull()
  })

  it('rc=4 sem concluido_em nao e prova', () => {
    expect(reprovaDaProvaDoRobo([pedido({ concluidoEm: null })], brt('13:45'))).toBeNull()
  })

  it('sem recebido_em qualquer prova e mais nova que nenhuma leitura', () => {
    expect(reprovaDaProvaDoRobo([pedido()], null)).not.toBeNull()
  })
})

describe('disjuntor por manifesto (A3)', () => {
  const falhaAuto = (hhmm: string, over: Partial<PedidoParaBarreira> = {}) =>
    pedido({ rc: 12, createdAt: brt(hhmm), concluidoEm: brt(hhmm), ...over })

  it('3 falhas automaticas hoje travam', () => {
    const r = reprovaDoDisjuntor([falhaAuto('13:49'), falhaAuto('14:00'), falhaAuto('14:10')], INICIO_DO_DIA, 3)
    expect(r).toBe('3 tentativas automáticas falharam hoje — só pedido humano')
  })

  it('2 falhas nao travam — o 70319 so baixou na terceira (rc=12, rc=12, rc=0)', () => {
    expect(reprovaDoDisjuntor([falhaAuto('13:49'), falhaAuto('14:00')], INICIO_DO_DIA, 3)).toBeNull()
  })

  it('falha HUMANA nao conta: o disjuntor para a maquina, nao a pessoa', () => {
    const humanas = ['13:49', '14:00', '14:10'].map((h) => falhaAuto(h, { origem: 'humano' }))
    expect(falhasAutomaticasHoje(humanas, INICIO_DO_DIA)).toBe(0)
    expect(reprovaDoDisjuntor(humanas, INICIO_DO_DIA, 3)).toBeNull()
  })

  it('falha de ONTEM nao conta', () => {
    const ontem = ['13:49', '14:00', '14:10'].map((h) =>
      falhaAuto(h, { createdAt: brt(h, '2026-10-12'), concluidoEm: brt(h, '2026-10-12') }))
    expect(falhasAutomaticasHoje(ontem, INICIO_DO_DIA)).toBe(0)
    expect(reprovaDoDisjuntor(ontem, INICIO_DO_DIA, 3)).toBeNull()
  })

  it('so situacao falhou conta — conferencia e concluido nao sao falha', () => {
    const lista = [
      falhaAuto('13:49'),
      falhaAuto('14:00', { situacao: 'conferencia', rc: 11 }),
      falhaAuto('14:10', { situacao: 'concluido', rc: 0 }),
    ]
    expect(falhasAutomaticasHoje(lista, INICIO_DO_DIA)).toBe(1)
  })

  it('limite abaixo de 1 vira 1: o disjuntor nao desliga por env', () => {
    expect(reprovaDoDisjuntor([], INICIO_DO_DIA, 0)).toBeNull()
    expect(reprovaDoDisjuntor([falhaAuto('13:49')], INICIO_DO_DIA, 0)).not.toBeNull()
  })
})

describe('barreirasDoRobo (A2 + A3)', () => {
  const ctx = { recebidoEm: brt('13:45'), inicioDoDia: INICIO_DO_DIA, maxFalhasDia: 3 }

  it('o laco do 70329 depois de 3 voltas: as duas barreiras falam', () => {
    const voltas = [
      pedido({ createdAt: brt('13:49'), concluidoEm: brt('13:50') }),
      pedido({ createdAt: brt('13:59'), concluidoEm: brt('14:00') }),
      pedido({ createdAt: brt('14:09'), concluidoEm: brt('14:10') }),
    ]
    const r = barreirasDoRobo(voltas, ctx)
    expect(r).toHaveLength(2)
    expect(r[0]).toContain('às 14:10')
    expect(r[1]).toContain('3 tentativas automáticas')
  })

  it('manifesto sem historico passa', () => {
    expect(barreirasDoRobo([], ctx)).toEqual([])
  })
})

describe('horaBrasilia', () => {
  it('usa o fuso de Brasilia, nao o do processo', () => {
    expect(horaBrasilia(new Date('2026-10-13T16:10:00Z'))).toBe('13:10')
  })
})
