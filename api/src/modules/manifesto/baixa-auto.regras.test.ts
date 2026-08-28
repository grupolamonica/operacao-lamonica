import { describe, expect, it } from 'bun:test'

import {
  avaliar,
  avaliarGalileu,
  avaliarSpx,
  identidadeConfere,
  mesmaCidade,
  normalizar,
  ordenarParaFila,
  type EmbarqueGalileu,
  type LinhaSpx,
  type ManifestoParaAvaliar,
} from './baixa-auto.regras'

// Fixtures com os números REAIS medidos em 28/08 — quando um teste quebra, dá para
// ir ao manifesto e ver o que mudou de verdade.

const refLT = (over: Partial<NonNullable<ManifestoParaAvaliar['referencia_cliente']>> = {}) => ({
  valor: 'LT0Q8J02DXVF1',
  formato: 'LT',
  guardas_erp_ok: true,
  guardas_reprovadas: [],
  local_entrega_cte: 'JABOATAO DOS GUARARAPES',
  ...over,
})

const refB1 = (over: Partial<NonNullable<ManifestoParaAvaliar['referencia_cliente']>> = {}) => ({
  valor: 'B101486836',
  formato: 'B1',
  guardas_erp_ok: true,
  guardas_reprovadas: [],
  local_entrega_cte: 'DUQUE DE CAXIAS',
  ...over,
})

/** 69432 — DESCARREGADO desde 20/08, manifesto aberto há 214 h */
const linhaSpx = (over: Partial<LinhaSpx> = {}): LinhaSpx => ({
  'LH Trip Number': 'LT0Q8J02DXVF1',
  Status: 'Completed',
  'Status Operacional': 'DESCARREGADO',
  'ETA DESTINO REAL': '20/08/2026 10:37',
  Station_Destino: '[10963]SoC_PE_Jaboatao dos Guararapes',
  ...over,
})

/** 69574 — FINALIZADO às 10:10 de 28/08 */
const embarque = (over: Partial<EmbarqueGalileu> = {}): EmbarqueGalileu => ({
  codembarque: '2348791',
  codstatembarque: '3',
  descrstatembarque: 'FINALIZADO',
  entrega_dtahrfim: '2026-08-28T10:10:00',
  entrega_dtahrchegada: '2026-08-28T08:18:00',
  entrega_cidade: 'DUQUE DE CAXIAS/RJ/BRA',
  mot1_nome: 'WILLIAM DE SOUZA SANTOS',
  placacarreta: 'PLY9C98',
  ...over,
})

const manifestoB1 = (over: Partial<ManifestoParaAvaliar> = {}): ManifestoParaAvaliar => ({
  referencia_cliente: refB1(),
  motorista: 'WILLIAM DE SOUZA SANTOS',
  carreta: 'PLY9C98',
  ...over,
})

describe('normalizar', () => {
  it('ignora acento, caixa e pontuacao', () => {
    expect(normalizar('Simões Filho')).toBe('SIMOESFILHO')
    expect(normalizar('  ply-9c98 ')).toBe('PLY9C98')
  })

  it('trata nulo e indefinido como vazio', () => {
    expect(normalizar(null)).toBe('')
    expect(normalizar(undefined)).toBe('')
  })
})

describe('mesmaCidade', () => {
  it('compara so o primeiro segmento porque os lados escrevem diferente', () => {
    // CTe diz "FEIRA DE SANTANA"; Galileu diz "FEIRA DE SANTANA/BA/BRA"
    expect(mesmaCidade('FEIRA DE SANTANA', 'FEIRA DE SANTANA/BA/BRA')).toBe(true)
    expect(mesmaCidade('MACEIÓ', 'MACEIO/AL/BRA')).toBe(true)
  })

  it('cidade diferente reprova', () => {
    expect(mesmaCidade('DUQUE DE CAXIAS', 'SIMOES FILHO/BA/BRA')).toBe(false)
  })

  it('ausencia NAO e igualdade', () => {
    // o modo de falha classico: '' == '' passaria tudo
    expect(mesmaCidade('', '')).toBe(false)
    expect(mesmaCidade('DUQUE DE CAXIAS', null)).toBe(false)
  })
})

describe('identidadeConfere', () => {
  const rodopar = { motorista: 'CLAUDIO BARBOSA DE JESUS', carreta: 'OZV4028' }

  it('os dois batendo passa', () => {
    const r = identidadeConfere(rodopar, { motorista: 'CLAUDIO BARBOSA DE JESUS', carreta: 'OZV4028' })
    expect(r.ok).toBe(true)
    expect(r.detalhe).toBe('motorista+carreta')
  })

  it('so o motorista basta — foi o caso do 69602', () => {
    // 28/08: Galileu registrou carreta RDA8G36, Rodopar tinha OZV4028. Troca de
    // carreta no meio da viagem. Em 120 dias, 76 divergencias e ZERO cancelados.
    const r = identidadeConfere(rodopar, { motorista: 'CLAUDIO BARBOSA DE JESUS', carreta: 'RDA8G36' })
    expect(r.ok).toBe(true)
    expect(r.detalhe).toBe('só motorista')
  })

  it('so a carreta basta — substituicao de motorista', () => {
    const r = identidadeConfere(rodopar, { motorista: 'OUTRO NOME QUALQUER', carreta: 'OZV4028' })
    expect(r.ok).toBe(true)
    expect(r.detalhe).toBe('só carreta')
  })

  it('os dois divergindo reprova — e o unico caso em 120 dias', () => {
    const r = identidadeConfere(rodopar, { motorista: 'OUTRO', carreta: 'XXX0000' })
    expect(r.ok).toBe(false)
  })

  it('sem dado nenhum reprova: nao pude conferir nao vira conferi', () => {
    const r = identidadeConfere(rodopar, { motorista: '', carreta: '' })
    expect(r.ok).toBe(false)
    expect(r.detalhe).toBe('sem dado para conferir identidade')
  })
})

describe('avaliarSpx', () => {
  const manifesto: ManifestoParaAvaliar = { referencia_cliente: refLT() }

  it('DESCARREGADO com carimbo e elegivel', () => {
    const a = avaliarSpx(manifesto, [linhaSpx()])
    expect(a.elegivel).toBe(true)
    expect(a.regra).toBe('spx_descarregado')
    expect(a.reprovas).toEqual([])
    expect(a.evidencia?.carimbo).toBe('20/08/2026 10:37')
  })

  it('CARREGADO reprova', () => {
    const a = avaliarSpx(manifesto, [linhaSpx({ 'Status Operacional': 'CARREGADO', 'ETA DESTINO REAL': '' })])
    expect(a.elegivel).toBe(false)
    expect(a.reprovas).toContain('status do cliente: CARREGADO')
  })

  it('DESCARREGADO sem carimbo reprova — rotulo nao e fato', () => {
    const a = avaliarSpx(manifesto, [linhaSpx({ 'ETA DESTINO REAL': '' })])
    expect(a.elegivel).toBe(false)
    expect(a.reprovas).toContain('sem carimbo de entrega (ETA DESTINO REAL)')
  })

  it('LH ausente NAO e evidencia de nada', () => {
    const a = avaliarSpx(manifesto, [])
    expect(a.elegivel).toBe(false)
    expect(a.evidencia).toBeNull()
  })

  it('duas viagens com o mesmo LH reprova', () => {
    const a = avaliarSpx(manifesto, [linhaSpx(), linhaSpx()])
    expect(a.elegivel).toBe(false)
    expect(a.reprovas).toContain('2 viagens com o mesmo LH')
  })

  it('guardas do ERP reprovadas derrubam, e o motivo original viaja junto', () => {
    const a = avaliarSpx(
      { referencia_cliente: refLT({ guardas_erp_ok: false, guardas_reprovadas: ['referência em 2 manifestos abertos'] }) },
      [linhaSpx()],
    )
    expect(a.elegivel).toBe(false)
    expect(a.reprovas.some((r) => r.includes('referência em 2 manifestos abertos'))).toBe(true)
  })
})

describe('avaliarGalileu', () => {
  it('FINALIZADO com carimbo, destino e identidade e elegivel', () => {
    const a = avaliarGalileu(manifestoB1(), [embarque()])
    expect(a.elegivel).toBe(true)
    expect(a.regra).toBe('galileu_finalizado')
    expect(a.reprovas).toEqual([])
  })

  it('EM VIAGEM reprova mesmo com entrega carimbada', () => {
    // decisao do Danilo: so status terminal. O 69532 tinha fim de entrega em 25/08
    // e seguia EM VIAGEM — fica de fora por regra, nao por falta de evidencia.
    const a = avaliarGalileu(manifestoB1(), [
      embarque({ codstatembarque: '2', descrstatembarque: 'EM VIAGEM' }),
    ])
    expect(a.elegivel).toBe(false)
    expect(a.reprovas).toContain('status do cliente: EM VIAGEM')
  })

  it('compara pelo CODIGO, nao pelo texto', () => {
    // o codigo 6 tem quatro redacoes em producao; uma regra por texto nasce quebrada
    const a = avaliarGalileu(manifestoB1(), [
      embarque({ codstatembarque: '6', descrstatembarque: 'PENDENTE DE VINCULO (PENDENTE FINALIZACAO)' }),
    ])
    expect(a.elegivel).toBe(false)
  })

  it('destino divergente reprova', () => {
    const a = avaliarGalileu(manifestoB1(), [embarque({ entrega_cidade: 'SIMOES FILHO/BA/BRA' })])
    expect(a.elegivel).toBe(false)
    expect(a.reprovas.some((r) => r.startsWith('destino do CTe'))).toBe(true)
  })

  it('carreta divergente passa se o motorista bate', () => {
    const a = avaliarGalileu(manifestoB1(), [embarque({ placacarreta: 'RDA8G36' })])
    expect(a.elegivel).toBe(true)
  })

  it('motorista e carreta divergindo reprova', () => {
    const a = avaliarGalileu(manifestoB1(), [embarque({ mot1_nome: 'OUTRO', placacarreta: 'XXX0000' })])
    expect(a.elegivel).toBe(false)
    expect(a.reprovas).toContain('motorista e carreta divergem')
  })

  it('carga em dois embarques reprova', () => {
    const a = avaliarGalileu(manifestoB1(), [embarque(), embarque({ codembarque: '2348792' })])
    expect(a.elegivel).toBe(false)
    expect(a.reprovas).toContain('carga em 2 embarques')
  })

  it('carga ausente no Galileu reprova — 8 dos 32 abertos em 28/08', () => {
    const a = avaliarGalileu(manifestoB1(), [])
    expect(a.elegivel).toBe(false)
    expect(a.reprovas).toContain('carga não encontrada no Galileu')
  })
})

describe('avaliar (despacho por familia)', () => {
  it('LT vai para o SPX', () => {
    const a = avaliar({ referencia_cliente: refLT() }, { spx: [linhaSpx()], galileu: [] })
    expect(a.regra).toBe('spx_descarregado')
  })

  it('B1 vai para o Galileu', () => {
    const a = avaliar(manifestoB1(), { spx: [], galileu: [embarque()] })
    expect(a.regra).toBe('galileu_finalizado')
  })

  it('familia sem portal nao e erro, e so nao ha onde conferir', () => {
    const a = avaliar(
      { referencia_cliente: { valor: 'REMESSA: 2684123', formato: 'outro', guardas_erp_ok: false } },
      { spx: [], galileu: [] },
    )
    expect(a.elegivel).toBe(false)
    expect(a.reprovas).toContain('família sem portal correspondente')
  })

  it('manifesto sem referencia nao e avaliado', () => {
    const a = avaliar({}, { spx: [], galileu: [] })
    expect(a.elegivel).toBe(false)
  })
})

describe('ordenarParaFila', () => {
  it('mais tempo aberto primeiro', () => {
    // a fila do robo e servida por createdAt ASC e o job cria tudo no mesmo instante:
    // sem esta ordenacao, o manifesto de 214 h nao teria prioridade sobre o de 9 h
    const ordenado = ordenarParaFila([
      { codman: 69666, horas_aberto: 9 },
      { codman: 69432, horas_aberto: 214 },
      { codman: 69577, horas_aberto: 97 },
    ])
    expect(ordenado.map((i) => i.codman)).toEqual([69432, 69577, 69666])
  })

  it('nao muta a lista original', () => {
    const original = [{ horas_aberto: 1 }, { horas_aberto: 2 }]
    ordenarParaFila(original)
    expect(original[0].horas_aberto).toBe(1)
  })

  it('horas ausentes vao para o fim', () => {
    const ordenado = ordenarParaFila([{ horas_aberto: null }, { horas_aberto: 5 }])
    expect(ordenado[0].horas_aberto).toBe(5)
  })
})
