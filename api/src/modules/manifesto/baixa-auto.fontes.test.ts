import { beforeEach, describe, expect, it } from 'bun:test'

import {
  __resetCircuitos,
  lerGalileu,
  lerSpx,
  podeAgir,
  type PortaGalileu,
} from './baixa-auto.fontes'

/**
 * SALVAGUARDAS COM FALHA INJETADA.
 *
 * O plano exige este arquivo antes de qualquer linha de F3: salvaguarda que nunca
 * viu a fonte quebrada é uma esperança, não uma proteção. Cada caso aqui é um modo
 * de falha real das duas fontes, e o que se verifica em todos é a mesma coisa —
 * que o sistema NÃO AGE.
 */

const AGORA = Date.parse('2026-08-28T20:00:00Z')
const agora = () => AGORA

const spxOk = async () => ({
  fetched: 2,
  byTab: { planejado: 35, aceito: 9, concluido: 1284 },
  errors: [] as { tab: string; error: string }[],
  rows: [
    { 'LH Trip Number': 'LT0Q8J02DXVF1', 'Status Operacional': 'DESCARREGADO', 'ETA DESTINO REAL': '20/08/2026 10:37' },
    { 'LH Trip Number': 'LT0Q8S02ELJ91', 'Status Operacional': 'DESCARREGADO', 'ETA DESTINO REAL': '28/08/2026 09:55' },
  ],
}) as any

const portaOk = (frescorIso = '2026-08-28T19:45:00Z'): PortaGalileu => ({
  frescor: async () => frescorIso,
  ofertas: async (g) => g.map((x) => ({ grupos_id: x, codembarque: `234${x.slice(-3)}` })),
  embarques: async (c) => c.map((x) => ({ codembarque: x, codstatembarque: '3', descrstatembarque: 'FINALIZADO' })),
})

beforeEach(() => __resetCircuitos())

describe('S1 — circuit breaker', () => {
  it('sucesso indexa por LH', async () => {
    const r = await lerSpx(spxOk, agora)
    expect(r.estado).toBe('ok')
    expect(r.porChave.get('LT0Q8J02DXVF1')).toBeTruthy()
  })

  it('abre no 3o erro e para de chamar a fonte', async () => {
    const quebra = async () => { throw new Error('sessão SPX expirada') }
    for (let i = 0; i < 3; i++) expect((await lerSpx(quebra as any, agora)).estado).toBe('indisponivel')

    let chamou = false
    const r = await lerSpx((async () => { chamou = true; return spxOk() }) as any, agora)
    expect(r.estado).toBe('indisponivel')
    // o ponto do breaker não é devolver erro — é NÃO bater na fonte que está caindo
    expect(chamou).toBe(false)
  })

  it('sucesso zera o contador', async () => {
    const quebra = async () => { throw new Error('erro') }
    await lerSpx(quebra as any, agora)
    await lerSpx(quebra as any, agora)
    await lerSpx(spxOk, agora)
    await lerSpx(quebra as any, agora)
    let chamou = false
    await lerSpx((async () => { chamou = true; return spxOk() }) as any, agora)
    expect(chamou).toBe(true)
  })
})

describe('S2 — falha parcial do SPX', () => {
  // O furo mais traiçoeiro das duas fontes: fetchAspRows só lança quando TODAS as
  // abas falham. Com uma só caindo ele devolve 200 — e o Completed, único status
  // que interessa, mora justamente na aba de histórico.
  it('aba com erro derruba o ciclo mesmo com HTTP 200', async () => {
    const parcial = async () => ({
      fetched: 44, byTab: { planejado: 35, aceito: 9, concluido: 0 },
      errors: [{ tab: 'concluido', error: 'timeout' }], rows: [],
    })
    const r = await lerSpx(parcial as any, agora)
    expect(r.estado).toBe('parcial')
    expect(r.porChave.size).toBe(0)
  })

  it('aba concluído vazia derruba mesmo sem erro reportado', async () => {
    // 1.284 concluídos em 90 dias na medição de 28/08 — zero não é dia calmo
    const semHistorico = async () => ({
      fetched: 44, byTab: { planejado: 35, aceito: 9, concluido: 0 }, errors: [], rows: [],
    })
    const r = await lerSpx(semHistorico as any, agora)
    expect(r.estado).toBe('parcial')
    expect(r.motivo).toContain('aba concluído vazia')
  })

  it('parcial NÃO conta para o breaker — a chamada funcionou', async () => {
    const parcial = async () => ({ fetched: 0, byTab: { concluido: 0 }, errors: [{ tab: 'concluido', error: 'x' }], rows: [] })
    for (let i = 0; i < 3; i++) await lerSpx(parcial as any, agora)
    let chamou = false
    await lerSpx((async () => { chamou = true; return spxOk() }) as any, agora)
    expect(chamou).toBe(true)
  })
})

describe('S3 — fonte congelada', () => {
  it('dado fresco passa', async () => {
    const r = await lerGalileu(['B101486836'], portaOk(), agora)
    expect(r.estado).toBe('ok')
    expect(r.idadeSeg).toBe(900)
  })

  it('dado velho fecha o portão — é a rede contra o Supabase de TESTE', async () => {
    const r = await lerGalileu(['B101486836'], portaOk('2026-08-25T19:45:00Z'), agora)
    expect(r.estado).toBe('congelada')
    expect(r.porChave.size).toBe(0)
    expect(r.idadeSeg).toBeGreaterThan(0)
  })

  it('frescor ilegível congela', async () => {
    const r = await lerGalileu(['B1'], { ...portaOk(), frescor: async () => null }, agora)
    expect(r.estado).toBe('congelada')
  })

  it('congelada não gasta as consultas seguintes', async () => {
    let tocou = false
    const porta: PortaGalileu = {
      frescor: async () => '2026-08-01T00:00:00Z',
      ofertas: async () => { tocou = true; return [] },
      embarques: async () => { tocou = true; return [] },
    }
    await lerGalileu(['B1'], porta, agora)
    expect(tocou).toBe(false)
  })
})

describe('S4 — configuração não é indisponibilidade', () => {
  it('credencial ausente vira nao_configurada e NÃO abre o circuito', async () => {
    // abrir o circuito aqui esconderia um problema de config atrás de um
    // "temporariamente indisponível" que nunca resolve sozinho
    const semCred = { frescor: async () => { throw new Error('CARGAS_SUPABASE_URL is not defined') } } as unknown as PortaGalileu
    expect((await lerGalileu(['B1'], semCred, agora)).estado).toBe('nao_configurada')

    let chamou = false
    await lerGalileu(['B1'], { ...portaOk(), frescor: async () => { chamou = true; return '2026-08-28T19:45:00Z' } }, agora)
    expect(chamou).toBe(true)
  })

  it('erro de rede vira indisponivel e conta para o breaker', async () => {
    const caiu = { frescor: async () => { throw new Error('ECONNRESET') } } as unknown as PortaGalileu
    for (let i = 0; i < 3; i++) await lerGalileu(['B1'], caiu, agora)
    expect((await lerGalileu(['B1'], portaOk(), agora)).estado).toBe('indisponivel')
  })
})

describe('podeAgir', () => {
  it('só ok autoriza', () => {
    for (const estado of ['indisponivel', 'parcial', 'congelada', 'nao_configurada'] as const) {
      expect(podeAgir({ estado, motivo: null, porChave: new Map(), idadeSeg: null })).toBe(false)
    }
    expect(podeAgir({ estado: 'ok', motivo: null, porChave: new Map(), idadeSeg: null })).toBe(true)
  })

  it('grupo sem embarque fica AUSENTE do mapa, não vazio', async () => {
    // "não encontrei" e "encontrei e não serve" reprovam por motivos diferentes na
    // auditoria — colapsar os dois em lista vazia perderia a distinção
    const porta: PortaGalileu = {
      frescor: async () => '2026-08-28T19:45:00Z',
      ofertas: async () => [{ grupos_id: 'B101486836', codembarque: null }],
      embarques: async () => [],
    }
    const r = await lerGalileu(['B101486836'], porta, agora)
    expect(r.estado).toBe('ok')
    expect(r.porChave.has('B101486836')).toBe(false)
  })
})
