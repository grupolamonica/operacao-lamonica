/**
 * F2 — o orquestrador da baixa automática.
 *
 * Junta as três peças: o snapshot do coletor (o que o ERP diz), as duas fontes de
 * cliente (`baixa-auto.fontes.ts`) e as regras puras (`baixa-auto.regras.ts`).
 * Grava TODA avaliação em `manifesto_baixa_auto_avaliacoes`.
 *
 * NESTA FASE NÃO ENFILEIRA NADA. `modo='sombra'` é o default e só sai dele quando
 * MANIFESTO_BAIXA_AUTO_ENABLED=true — o que é decisão de deploy, não de código.
 * O valor da sombra é medir: por semanas o job diz o que TERIA feito, e o desfecho
 * real de cada manifesto vira o gabarito. Sem esse período, a primeira baixa
 * automática seria também a primeira medição.
 *
 * A ORDEM DE PRECEDÊNCIA DAS BARREIRAS, de fora para dentro:
 *   1. fonte degradada  -> a família inteira não é avaliada neste ciclo
 *   2. guardas do ERP   -> vieram prontas do coletor, dentro de referencia_cliente
 *   3. regra do cliente -> status terminal + carimbo
 *   4. (F3) posto ativo, teto diário, kill switch
 * Nada aqui pula direto para a 3: evidência sem fonte confiável não é evidência.
 */
import { and, gte, inArray, sql } from 'drizzle-orm'

import { db } from '../../db/client'
import { manifestoBaixaAutoAvaliacoes, manifestoBaixaPedidos, type ModoBaixaAuto } from '../../db/schema'
import { logger } from '../../lib/logger'
import { getPendencias, type ManifestoPendencia } from './manifesto.service'
import { lerGalileu, lerSpx, podeAgir, type LeituraFonte } from './baixa-auto.fontes'
import { avaliar, ordenarParaFila, type Avaliacao } from './baixa-auto.regras'

const CICLO_MIN = 10

export interface ResumoCiclo {
  modo: ModoBaixaAuto
  ciclo: string
  /** manifestos do snapshot com referência utilizável */
  candidatos: number
  elegiveis: number
  gravadas: number
  /** ordenados por horas em aberto, os que seriam enfileirados */
  paraFila: { codman: number; filial: number; serie: string; regra: string; horas_aberto: number }[]
  fontes: { spx: string; galileu: string }
  tetoDiario: { limite: number; usadoHoje: number }
}

/** Instante do ciclo, truncado em 10 min — a identidade que dedupe usa. */
export function inicioDoCiclo(agora = new Date()): Date {
  const d = new Date(agora)
  d.setMinutes(Math.floor(d.getMinutes() / CICLO_MIN) * CICLO_MIN, 0, 0)
  return d
}

function inteiroDoEnv(nome: string, padrao: number): number {
  const bruto = process.env[nome]?.trim()
  if (!bruto) return padrao
  const n = Number.parseInt(bruto, 10)
  return Number.isFinite(n) && n >= 0 ? n : padrao
}

/** Sombra é o default. Sair dela é decisão de deploy, nunca de código. */
export function modoAtual(): ModoBaixaAuto {
  return process.env.MANIFESTO_BAIXA_AUTO_ENABLED?.trim() === 'true' ? 'real' : 'sombra'
}

/**
 * Quantos pedidos automáticos hoje. Conta SOBRE A TABELA, não em memória:
 * contador em processo zera no restart e o teto viraria decoração.
 */
export async function usadoHoje(): Promise<number> {
  const inicioDoDia = new Date()
  inicioDoDia.setHours(0, 0, 0, 0)
  const [linha] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(manifestoBaixaPedidos)
    .where(
      and(
        sql`${manifestoBaixaPedidos.origem} <> 'humano'`,
        gte(manifestoBaixaPedidos.createdAt, inicioDoDia),
      ),
    )
  return linha?.n ?? 0
}

const chaveDe = (p: ManifestoPendencia) =>
  `${p.codman}|${p.filial}|${(p.serie ?? '').trim().slice(0, 10)}`

/** ISO -> Date, tolerando o formato BR da aba ASP ('DD/MM/YYYY HH:MM'). */
function paraData(valor: string | null): Date | null {
  if (!valor) return null
  const br = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})/)
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}T${br[4]}:${br[5]}:00-03:00` : valor
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? new Date(ms) : null
}

/**
 * Roda um ciclo de avaliação. Idempotente por (manifesto, ciclo): rodar duas vezes
 * na mesma janela de 10 min não duplica linha, graças ao índice único do .sql.
 * Sem isso, um retry inflaria a série histórica e a taxa de acerto medida sobre
 * ela ficaria errada em silêncio.
 */
/**
 * Tabela ausente (42P01) quase sempre significa uma coisa só: a migration
 * `manifesto-baixa-automacao.sql` ainda não foi aplicada. Vale trocar o stack
 * trace por essa frase — o job repete a cada 10 min, e um erro que se explica
 * sozinho poupa a investigação inteira.
 */
function comMensagemDeMigration(e: unknown): Error {
  const codigo = (e as { code?: string })?.code
  const msg = e instanceof Error ? e.message : String(e)
  if (codigo === '42P01' || /manifesto_baixa_auto_avaliacoes.*does not exist/i.test(msg)) {
    return new Error(
      'manifesto_baixa_auto_avaliacoes não existe — aplique drizzle/manifesto-baixa-automacao.sql ' +
        'pelo workflow db-migrate.yml (dry-run primeiro) antes de esperar avaliação nenhuma',
    )
  }
  return e instanceof Error ? e : new Error(msg)
}

export async function avaliarCiclo(): Promise<ResumoCiclo> {
  const modo = modoAtual()
  const ciclo = inicioDoCiclo()
  const limite = inteiroDoEnv('MANIFESTO_BAIXA_AUTO_TETO', 3)

  const snapshot = await getPendencias()
  const candidatos = snapshot.pendencias.filter(
    (p) => p.codman != null && p.filial != null && p.referencia_cliente?.valor,
  )

  const lhs = [
    ...new Set(
      candidatos
        .filter((p) => p.referencia_cliente?.formato === 'LT')
        .map((p) => String(p.referencia_cliente!.valor).trim().toUpperCase()),
    ),
  ]
  const grupos = [
    ...new Set(
      candidatos
        .filter((p) => p.referencia_cliente?.formato === 'B1')
        .map((p) => String(p.referencia_cliente!.valor).trim().toUpperCase()),
    ),
  ]

  // Só busca a fonte que tem cliente para avaliar. Fonte sem candidato não é
  // consultada — e uma fonte não consultada não pode derrubar a outra família.
  const [spx, galileu] = await Promise.all([
    lhs.length ? lerSpx() : Promise.resolve(vaziaOk()),
    grupos.length ? lerGalileu(grupos) : Promise.resolve(vaziaOk()),
  ])

  logger.info(
    { modo, candidatos: candidatos.length, lhs: lhs.length, grupos: grupos.length,
      spx: spx.estado, galileu: galileu.estado },
    '[baixa-auto] ciclo iniciado',
  )

  const linhas: (typeof manifestoBaixaAutoAvaliacoes.$inferInsert)[] = []
  const elegiveis: { p: ManifestoPendencia; a: Avaliacao }[] = []

  for (const p of candidatos) {
    const familia = p.referencia_cliente?.formato
    const fonte = familia === 'LT' ? spx : familia === 'B1' ? galileu : null
    const ref = String(p.referencia_cliente?.valor ?? '').trim().toUpperCase()

    let avaliacao: Avaliacao
    if (fonte && !podeAgir(fonte)) {
      // A barreira mais externa. Registra assim mesmo: um ciclo inteiro sem linha
      // nenhuma seria indistinguível de um ciclo em que nada era elegível, e a
      // série histórica precisa mostrar a diferença.
      avaliacao = {
        elegivel: false,
        regra: null,
        reprovas: [`fonte ${familia === 'LT' ? 'SPX' : 'Galileu'} ${fonte.estado}: ${fonte.motivo}`],
        evidencia: null,
      }
    } else {
      avaliacao = avaliar(p, {
        spx: spx.porChave.get(ref) ?? [],
        galileu: galileu.porChave.get(ref) ?? [],
      })
    }

    if (avaliacao.elegivel) elegiveis.push({ p, a: avaliacao })

    linhas.push({
      codman: p.codman!,
      filial: p.filial!,
      serie: (p.serie ?? '').trim().slice(0, 10),
      modo,
      ciclo,
      elegivel: avaliacao.elegivel,
      regra: avaliacao.regra,
      reprovas: avaliacao.reprovas,
      referenciaCliente: ref.slice(0, 60),
      clienteStatus: avaliacao.evidencia?.status?.slice(0, 40) ?? null,
      clienteCarimbo: paraData(avaliacao.evidencia?.carimbo ?? null),
      fonteIdadeSeg: fonte?.idadeSeg ?? null,
      guardas: {
        guardas_erp_ok: p.referencia_cliente?.guardas_erp_ok ?? null,
        guardas_reprovadas: p.referencia_cliente?.guardas_reprovadas ?? [],
        local_entrega_cte: p.referencia_cliente?.local_entrega_cte ?? null,
        destino_cliente: avaliacao.evidencia?.destino ?? null,
        horas_aberto: p.horas_aberto ?? null,
        estado_coletor: p.estado ?? null,
      },
    })
  }

  let gravadas = 0
  if (linhas.length) {
    try {
      // onConflictDoNothing: o índice único (codman, filial, serie, ciclo) é o que
      // garante idempotência de verdade — dois workers sobrepostos não duplicam.
      const inseridas = await db
        .insert(manifestoBaixaAutoAvaliacoes)
        .values(linhas)
        .onConflictDoNothing()
        .returning({ id: manifestoBaixaAutoAvaliacoes.id })
      gravadas = inseridas.length
    } catch (e) {
      throw comMensagemDeMigration(e)
    }
  }

  // Ordenados por horas em aberto — NÃO é cosmético. Em F3 esta é a ordem de
  // inserção, e a fila do robô é servida por createdAt ASC: sem isso, o manifesto
  // de 214 h não teria prioridade sobre o de 9 h.
  const paraFila = ordenarParaFila(
    elegiveis.map(({ p, a }) => ({
      codman: p.codman!,
      filial: p.filial!,
      serie: (p.serie ?? '').trim(),
      regra: a.regra!,
      horas_aberto: p.horas_aberto ?? 0,
    })),
  )

  const resumo: ResumoCiclo = {
    modo,
    ciclo: ciclo.toISOString(),
    candidatos: candidatos.length,
    elegiveis: elegiveis.length,
    gravadas,
    paraFila,
    fontes: {
      spx: spx.estado + (spx.motivo ? ` (${spx.motivo})` : ''),
      galileu: galileu.estado + (galileu.motivo ? ` (${galileu.motivo})` : ''),
    },
    tetoDiario: { limite, usadoHoje: await usadoHoje() },
  }

  logger.info(
    { modo, candidatos: resumo.candidatos, elegiveis: resumo.elegiveis, gravadas,
      fontes: resumo.fontes },
    modo === 'sombra'
      ? '[baixa-auto] ciclo em SOMBRA — nada foi enfileirado'
      : '[baixa-auto] ciclo avaliado',
  )

  return resumo
}

/** Fonte não consultada (nenhum candidato daquela família). Não é degradação. */
function vaziaOk(): LeituraFonte<never> {
  return { estado: 'ok', motivo: null, porChave: new Map(), idadeSeg: null }
}

/** O que a tela mostra no chip. Só o essencial — o detalhe fica na auditoria. */
export interface ResumoAvaliacao {
  elegivel: boolean
  regra: string | null
  reprovas: string[]
  cliente_status: string | null
  cliente_carimbo: string | null
  modo: string
  avaliado_em: string
}

/**
 * Última avaliação de cada manifesto pedido, em UMA consulta.
 *
 * Uma query por manifesto seriam ~65 idas ao banco a cada polling de 30 s da tela.
 * Aqui é um SELECT só, filtrado por codman e ordenado por avaliado_em desc — a
 * primeira linha de cada chave é a mais recente. Mesmo desenho de
 * pedidosPorManifesto, inclusive no motivo.
 */
export async function avaliacoesPorManifesto(
  refs: { codman: number; filial: number; serie?: string | null }[],
): Promise<Record<string, ResumoAvaliacao>> {
  if (!refs.length) return {}
  const linhas = await db
    .select()
    .from(manifestoBaixaAutoAvaliacoes)
    .where(inArray(manifestoBaixaAutoAvaliacoes.codman, refs.map((r) => r.codman)))
    .orderBy(sql`${manifestoBaixaAutoAvaliacoes.avaliadoEm} DESC`)

  const querido = new Set(refs.map((r) => `${r.codman}|${r.filial}|${(r.serie ?? '').trim().slice(0, 10)}`))
  const saida: Record<string, ResumoAvaliacao> = {}
  for (const l of linhas) {
    const chave = `${l.codman}|${l.filial}|${l.serie}`
    if (!querido.has(chave) || saida[chave]) continue
    saida[chave] = {
      elegivel: l.elegivel,
      regra: l.regra,
      reprovas: l.reprovas ?? [],
      cliente_status: l.clienteStatus,
      cliente_carimbo: l.clienteCarimbo ? l.clienteCarimbo.toISOString() : null,
      modo: l.modo,
      avaliado_em: l.avaliadoEm.toISOString(),
    }
  }
  return saida
}

export { chaveDe as chaveDaPendencia }
