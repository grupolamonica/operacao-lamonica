/**
 * F2 — os dois leitores de status do cliente, com circuit breaker e portão de frescor.
 *
 * A REGRA DE OURO DESTE ARQUIVO: fonte degradada ⇒ NENHUM pedido neste ciclo.
 * Ausência de linha nunca é evidência de nada. Um leitor que devolve vazio quando
 * a fonte caiu produziria exatamente o mesmo resultado que "esta viagem não está
 * concluída" — e as duas coisas não podem ser indistinguíveis quando o desfecho é
 * fechar manifesto no ERP.
 *
 * Por isso todo retorno carrega `estado`, e o orquestrador só age com 'ok'.
 */
import { cargasSupabase } from '../cargas/cargas.supabase'
import { fetchAspRows } from '../../adapters/spx-portal/asp.adapter'
import { logger } from '../../lib/logger'
import type { EmbarqueGalileu, LinhaSpx } from './baixa-auto.regras'

export type EstadoFonte = 'ok' | 'indisponivel' | 'parcial' | 'congelada' | 'nao_configurada'

export interface LeituraFonte<T> {
  estado: EstadoFonte
  /** por que não está 'ok' — vai para a auditoria, não só para o log */
  motivo: string | null
  /** chave (LH ou grupos_id) -> registros. Vazio quando estado !== 'ok'. */
  porChave: Map<string, T[]>
  /** idade do dado mais recente da fonte, em segundos. Null quando não medível. */
  idadeSeg: number | null
}

const vazia = <T>(estado: EstadoFonte, motivo: string): LeituraFonte<T> => ({
  estado,
  motivo,
  porChave: new Map(),
  idadeSeg: null,
})

// ── Circuit breaker ─────────────────────────────────────────────────────────
// Mesmo desenho de torre-spx-trips-client.js: N falhas seguidas abrem o circuito
// por um período. O detalhe que mais importa é o de lá também: 401/403 NÃO conta
// para o breaker — chave inválida não é falha transitória, e deixar o circuito
// abrir por causa dela esconderia um problema de configuração atrás de um
// "temporariamente indisponível" que nunca resolve sozinho.
const LIMITE_FALHAS = 3
const RESFRIAMENTO_MS = 60_000

interface Circuito { falhas: number; abertoAte: number }
const circuitos: Record<string, Circuito> = {
  spx: { falhas: 0, abertoAte: 0 },
  galileu: { falhas: 0, abertoAte: 0 },
}

const circuitoAberto = (nome: string) => circuitos[nome].abertoAte > Date.now()

function registrarFalha(nome: string): void {
  const c = circuitos[nome]
  c.falhas += 1
  if (c.falhas >= LIMITE_FALHAS) {
    c.abertoAte = Date.now() + RESFRIAMENTO_MS
    logger.warn({ fonte: nome, falhas: c.falhas }, '[baixa-auto] circuito aberto')
  }
}

function registrarSucesso(nome: string): void {
  circuitos[nome] = { falhas: 0, abertoAte: 0 }
}

/** Só para teste — o estado do breaker é de processo. */
export function __resetCircuitos(): void {
  circuitos.spx = { falhas: 0, abertoAte: 0 }
  circuitos.galileu = { falhas: 0, abertoAte: 0 }
}

function inteiroDoEnv(nome: string, padrao: number): number {
  const bruto = process.env[nome]?.trim()
  if (!bruto) return padrao
  const n = Number.parseInt(bruto, 10)
  return Number.isFinite(n) && n > 0 ? n : padrao
}

// ── SPX / Shopee ────────────────────────────────────────────────────────────

/**
 * Lê a aba ASP ao vivo. In-process (`fetchAspRows`), sem HTTP e sem API key — o
 * mesmo motor do GET /api/spx/asp e do sync do ranking.
 *
 * O PORTÃO QUE IMPORTA AQUI É O DA FALHA PARCIAL. `fetchAspRows` consulta três
 * abas e só lança quando TODAS falham; se apenas uma cair, ele devolve sucesso com
 * `errors` preenchido e `byTab` daquela aba em zero. E o `Completed` — o único
 * status que nos interessa — mora na aba de HISTÓRICO. Ou seja: a aba que sustenta
 * a regra inteira pode sumir sozinha, com resposta 200 e sem exceção. Os elegíveis
 * simplesmente desapareceriam, em silêncio.
 *
 * Por isso exigimos `errors.length === 0` E `byTab.concluido > 0`.
 */
export async function lerSpx(): Promise<LeituraFonte<LinhaSpx>> {
  if (circuitoAberto('spx')) return vazia('indisponivel', 'circuito aberto após falhas repetidas')

  let resultado: Awaited<ReturnType<typeof fetchAspRows>>
  try {
    resultado = await fetchAspRows({
      daysBack: inteiroDoEnv('MANIFESTO_BAIXA_AUTO_SPX_DIAS_ATRAS', 90),
      daysFwd: inteiroDoEnv('MANIFESTO_BAIXA_AUTO_SPX_DIAS_FRENTE', 15),
    })
  } catch (e) {
    registrarFalha('spx')
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn({ erro: msg }, '[baixa-auto] SPX indisponível')
    return vazia('indisponivel', `SPX indisponível: ${msg}`)
  }

  if (resultado.errors.length > 0) {
    // NÃO conta para o breaker: a chamada funcionou, o dado é que veio incompleto.
    // Abrir o circuito aqui atrasaria a recuperação sem nenhum ganho.
    const detalhe = resultado.errors.map((e) => `${e.tab}=${e.error}`).join(' | ')
    logger.warn({ detalhe }, '[baixa-auto] SPX parcial — nenhum pedido neste ciclo')
    return vazia('parcial', `abas com erro: ${detalhe}`)
  }

  const concluido = resultado.byTab.concluido ?? 0
  if (concluido <= 0) {
    // Zero viagens concluídas em 90 dias é impossível na operação real (a medição
    // de 28/08 deu 1.284). Isso é a aba de histórico vazia, não um dia calmo.
    logger.warn({ byTab: resultado.byTab }, '[baixa-auto] SPX sem aba concluído — nenhum pedido neste ciclo')
    return vazia('parcial', 'aba concluído vazia — é onde vivem os DESCARREGADO')
  }

  registrarSucesso('spx')

  const porChave = new Map<string, LinhaSpx[]>()
  let carimboMaisNovo = 0
  for (const linha of resultado.rows as unknown as LinhaSpx[]) {
    const lh = String(linha['LH Trip Number'] ?? '').trim().toUpperCase()
    if (!lh) continue
    const lista = porChave.get(lh)
    if (lista) lista.push(linha)
    else porChave.set(lh, [linha])

    const ms = msDeDataBr(linha['ETA DESTINO REAL'])
    if (ms && ms > carimboMaisNovo) carimboMaisNovo = ms
  }

  // Frescor INFORMATIVO, não portão: a entrega mais recente pode ser legitimamente
  // de algumas horas atrás num período calmo. Vai para a auditoria porque, olhando
  // a série depois, uma fonte que parou de avançar aparece imediatamente.
  const idadeSeg = carimboMaisNovo ? Math.round((Date.now() - carimboMaisNovo) / 1000) : null

  return { estado: 'ok', motivo: null, porChave, idadeSeg }
}

/** 'DD/MM/YYYY HH:MM' (formato que a aba ASP devolve) -> epoch ms. */
function msDeDataBr(valor: unknown): number | null {
  const m = String(valor ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/)
  if (!m) return null
  const [, d, mo, y, h, mi] = m
  const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:00-03:00`)
  return Number.isFinite(ms) ? ms : null
}

// ── Nestlé / Galileu ────────────────────────────────────────────────────────

const LOTE = 40

/**
 * Resolve `grupos_id` -> embarque, em dois saltos:
 *   nestle_ofertas.grupos_id -> nestle_ofertas.codembarque -> nestle_embarques
 *
 * NÃO EXISTE ATALHO POR `nestle_embarques.idcargas`: em produção essa coluna é
 * NULL. A ponte é a oferta, exatamente como o LEFT JOIN de get-programacao.js.
 *
 * O PORTÃO DE FRESCOR É O QUE PROTEGE ESTA FONTE, e ele tem uma sutileza que já
 * custaria caro: o frescor precisa ser `max(atualizado_em)` da TABELA INTEIRA,
 * nunca o `atualizado_em` da linha lida. A guarda anti-no-op do bot do Galileu só
 * grava quando o conteúdo muda, e linhas FINALIZADO saem do lote seguinte — ou
 * seja, a linha congela para sempre exatamente no estado que a regra usa. Medir o
 * frescor por ela diria "fresquíssimo" sobre uma fonte parada há semanas.
 *
 * Este portão também é a rede contra o torre estar apontado para o Supabase de
 * TESTE em vez do de produção: lá os dados estão parados, o portão fecha, e a
 * automação fica inerte em vez de errada.
 */
export async function lerGalileu(gruposIds: string[]): Promise<LeituraFonte<EmbarqueGalileu>> {
  if (circuitoAberto('galileu')) return vazia('indisponivel', 'circuito aberto após falhas repetidas')
  if (!gruposIds.length) return { estado: 'ok', motivo: null, porChave: new Map(), idadeSeg: null }

  const limiteMin = inteiroDoEnv('MANIFESTO_BAIXA_AUTO_GALILEU_FRESCOR_MIN', 120)

  try {
    // 1. Frescor da tabela inteira — ANTES de qualquer outra leitura. Se a fonte
    //    está parada, nem vale gastar as consultas seguintes.
    const { data: maisNovo, error: erroFrescor } = await cargasSupabase
      .from('nestle_embarques')
      .select('atualizado_em')
      .order('atualizado_em', { ascending: false })
      .limit(1)
    if (erroFrescor) throw new Error(`frescor: ${erroFrescor.message}`)

    const ultimo = maisNovo?.[0]?.atualizado_em ? Date.parse(maisNovo[0].atualizado_em) : NaN
    if (!Number.isFinite(ultimo)) {
      registrarFalha('galileu')
      return vazia('congelada', 'nestle_embarques sem nenhum atualizado_em legível')
    }
    const idadeSeg = Math.round((Date.now() - ultimo) / 1000)
    if (idadeSeg > limiteMin * 60) {
      // Não é falha de rede — a fonte respondeu. Não conta para o breaker.
      logger.warn({ idadeSeg, limiteMin }, '[baixa-auto] Galileu congelado — nenhum pedido neste ciclo')
      return {
        ...vazia('congelada', `dado mais recente tem ${Math.round(idadeSeg / 60)} min (limite ${limiteMin})`),
        idadeSeg,
      }
    }

    // 2. grupos_id -> codembarque
    const codPorGrupo = new Map<string, Set<string>>()
    for (let i = 0; i < gruposIds.length; i += LOTE) {
      const lote = gruposIds.slice(i, i + LOTE)
      const { data, error } = await cargasSupabase
        .from('nestle_ofertas')
        .select('grupos_id, codembarque')
        .in('grupos_id', lote)
      if (error) throw new Error(`nestle_ofertas: ${error.message}`)
      for (const o of data ?? []) {
        if (!o.codembarque) continue
        const chave = String(o.grupos_id).trim().toUpperCase()
        const set = codPorGrupo.get(chave) ?? new Set<string>()
        set.add(String(o.codembarque).trim())
        codPorGrupo.set(chave, set)
      }
    }

    // 3. codembarque -> embarque
    const todosCods = [...new Set([...codPorGrupo.values()].flatMap((s) => [...s]))]
    const embarquePorCod = new Map<string, EmbarqueGalileu>()
    for (let i = 0; i < todosCods.length; i += LOTE) {
      const lote = todosCods.slice(i, i + LOTE)
      const { data, error } = await cargasSupabase
        .from('nestle_embarques')
        .select(
          'codembarque, codstatembarque, descrstatembarque, entrega_dtahrfim, ' +
            'entrega_dtahrchegada, entrega_cidade, mot1_nome, placacarreta',
        )
        .in('codembarque', lote)
      if (error) throw new Error(`nestle_embarques: ${error.message}`)
      // cast explícito: com select() de muitas colunas o supabase-js não infere o
      // shape e cai num union com GenericStringError
      for (const e of (data ?? []) as unknown as EmbarqueGalileu[]) {
        embarquePorCod.set(String(e.codembarque).trim(), e)
      }
    }

    registrarSucesso('galileu')

    // Grupo sem oferta e grupo sem embarque ficam AUSENTES do mapa, não com lista
    // vazia: quem avalia distingue "não encontrei" de "encontrei e não serve", e
    // as duas reprovam por motivos diferentes na auditoria.
    const porChave = new Map<string, EmbarqueGalileu[]>()
    for (const [grupo, cods] of codPorGrupo) {
      const embarques = [...cods].map((c) => embarquePorCod.get(c)).filter((e): e is EmbarqueGalileu => Boolean(e))
      if (embarques.length) porChave.set(grupo, embarques)
    }

    return { estado: 'ok', motivo: null, porChave, idadeSeg }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Credencial errada/ausente é problema de configuração, não falha transitória:
    // abrir o circuito por ela empurraria o diagnóstico para debaixo do tapete.
    if (/not defined|JWT|apikey|invalid|401|403/i.test(msg)) {
      logger.error({ erro: msg }, '[baixa-auto] Galileu não configurado')
      return vazia('nao_configurada', `Galileu não configurado: ${msg}`)
    }
    registrarFalha('galileu')
    logger.warn({ erro: msg }, '[baixa-auto] Galileu indisponível')
    return vazia('indisponivel', `Galileu indisponível: ${msg}`)
  }
}

/**
 * Resumo das duas fontes para o orquestrador decidir se PODE agir neste ciclo.
 *
 * `podeAgir` é conjuntivo por família: dá para avaliar SPX com o Galileu caído e
 * vice-versa, mas nunca avaliar uma família cuja fonte não está 'ok'. Meia fonte
 * não vira meia decisão — vira decisão errada sobre a metade que faltou.
 */
export function podeAgir(fonte: LeituraFonte<unknown>): boolean {
  return fonte.estado === 'ok'
}
