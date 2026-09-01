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
import { cadeiaDeErro, codigoPg, detalharErro, motivoRaiz } from '../../db/erro-pg'
import { manifestoBaixaAutoAvaliacoes, manifestoBaixaPedidos, type ModoBaixaAuto } from '../../db/schema'
import { logger } from '../../lib/logger'
import { getPendencias, type ManifestoPendencia } from './manifesto.service'
import { lerGalileu, lerSpx, podeAgir, type LeituraFonte } from './baixa-auto.fontes'
import { avaliar, ordenarParaFila, type Avaliacao } from './baixa-auto.regras'
import { postoAtual, travarExecucao } from './baixa-auto.posto'
import { pedirBaixa, recuperarPedidosPresos } from './baixa.service'

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
  /** só em modo real: o que foi efetivamente enfileirado, e por que o resto não foi */
  enfileirados: number
  naoEnfileirados: string | null
  /**
   * Manifestos que estouraram na hora de enfileirar. Normalmente vazio.
   *
   * Existe para que uma falha isolada seja VISÍVEL sem deixar de ser isolada: antes de
   * 31/08 ela derrubava o ciclo inteiro (500), e a alternativa preguiçosa — engolir e
   * seguir — deixaria o ciclo "verde" escondendo manifesto que nunca é enfileirado.
   */
  falhas: { codman: number; erro: string }[]
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
  // Ambas as leituras precisam atravessar o embrulho do drizzle: `code` fica em
  // `cause.code`, e a mensagem de topo é "Failed query: ..." — o "does not exist"
  // só aparece na causa. Do jeito antigo, os DOIS lados do `if` davam falso e a
  // dica de migration nunca saía. Ver `db/erro-pg.ts`.
  const codigo = codigoPg(e)
  const msg = cadeiaDeErro(e)
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

  // ── MODO REAL: as barreiras que faltavam ────────────────────────────────────
  // Em sombra nada disto roda. Aqui a ordem importa e é de fora para dentro: sem
  // posto não há máquina para executar, sem teto não há limite, e só então age.
  let enfileirados = 0
  let naoEnfileirados: string | null = null
  const falhas: { codman: number; erro: string }[] = []

  if (modo === 'real' && paraFila.length) {
    const posto = await postoAtual()
    if (!posto) {
      // Sem posto ativo NÃO enfileira. É a lição de 21/08: o operador clicou BAIXAR,
      // viu NA FILA e ficou esperando uma janela que nunca abriu porque não havia
      // agente. Pedido que ninguém pode executar é pior que pedido nenhum — ele
      // ainda bloqueia o pedido humano do mesmo manifesto pelo índice único.
      naoEnfileirados = 'nenhuma máquina com o posto de automação ativo'
    } else {
      const usados = await usadoHoje()
      const vagas = Math.max(0, limite - usados)
      if (vagas === 0) {
        naoEnfileirados = `teto diário atingido (${usados}/${limite})`
      } else {
        if (paraFila.length > vagas) {
          // Diz em voz alta o que ficou de fora. Truncar em silêncio faria o log
          // parecer "cobrimos tudo" quando cobriu parte — e a fila do dia seguinte
          // herdaria o resto sem ninguém saber por quê.
          naoEnfileirados = `${paraFila.length - vagas} acima do teto (${usados}/${limite}) — ficam para o próximo ciclo`
        }
        // paraFila JÁ vem ordenado por horas em aberto: como a fila do robô é servida
        // por createdAt ASC, inserir nesta ordem é o que dá prioridade ao manifesto
        // mais antigo. Sem isso o de 229 h competiria de igual para igual com o de 9 h.
        // Índice pela chave COMPLETA (codman|filial|serie), não só por codman: em 365
        // dias existem 1.240 pares codman+filial repetidos com séries diferentes, e
        // casar pelo número do manifesto pegaria a evidência de outra viagem.
        const porChaveElegivel = new Map(
          elegiveis.map(({ p, a }) => [`${p.codman}|${p.filial}|${(p.serie ?? '').trim()}`, { p, a }]),
        )

        for (const item of paraFila.slice(0, vagas)) {
          const achado = porChaveElegivel.get(`${item.codman}|${item.filial}|${item.serie}`)
          if (!achado) continue
          const { p, a } = achado
          // try/catch POR ITEM, e não em volta do laço. Em 31/08 um único manifesto
          // (o 69465, que já tinha pedido em `conferencia`) fez `pedirBaixa` lançar, e
          // como não havia captura em lugar nenhum da cadeia o ciclo INTEIRO virou 500:
          // os outros 20 elegíveis não foram nem tentados, e o cron repetiu isso a cada
          // 10 min em silêncio.
          //
          // A lição não é o defeito daquele dia — esse está corrigido em `db/erro-pg.ts`.
          // É que enfileirar N manifestos é N operações independentes, e uma delas
          // falhar não é motivo para as outras não acontecerem. Falha some no `falhas`
          // do resumo, que a tela mostra; não é engolida.
          try {
            const r = await pedirBaixa({
              codman: item.codman,
              filial: item.filial,
              serie: item.serie,
              operatorId: posto.user_id,
              origem: a.regra === 'galileu_finalizado' ? 'galileu' : 'spx',
              regra: a.regra,
              referenciaCliente: p.referencia_cliente?.valor ?? null,
              clienteStatus: a.evidencia?.status ?? null,
              clienteCarimbo: paraData(a.evidencia?.carimbo ?? null),
              guardas: {
                regra: a.regra,
                destino_cliente: a.evidencia?.destino ?? null,
                local_entrega_cte: p.referencia_cliente?.local_entrega_cte ?? null,
                horas_aberto: p.horas_aberto ?? null,
                estado_coletor: p.estado ?? null,
                posto: posto.agente,
              },
            })
            if (r.ok) {
              enfileirados += 1
              logger.info({ codman: item.codman, regra: a.regra, pedido: r.pedido.id },
                '[baixa-auto] baixa AUTOMATICA enfileirada')
            } else {
              // Recusa aqui é quase sempre "já existe pedido ativo" — inclusive um
              // pedido HUMANO criado entre a avaliação e agora. Não é erro: é o índice
              // único fazendo o trabalho dele.
              logger.info({ codman: item.codman, motivo: r.motivo }, '[baixa-auto] pedido recusado')
            }
          } catch (erro) {
            // motivoRaiz e não a cadeia: a mensagem de topo do drizzle é a query inteira,
            // então cortar a cadeia em 200 guardaria SQL e descartaria o motivo.
            falhas.push({ codman: item.codman, erro: motivoRaiz(erro) })
            logger.error(
              { codman: item.codman, filial: item.filial, serie: item.serie, ...detalharErro(erro) },
              '[baixa-auto] falha ao enfileirar UM manifesto — seguindo para os próximos',
            )
          }
        }
      }
    }
  }

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
    enfileirados,
    naoEnfileirados,
    falhas,
  }

  // enfileirados/naoEnfileirados VÃO no log, e isso não é enfeite: até 01/09 esta linha
  // omitia os dois, então um ciclo que não enfileirou NADA por falta de posto produzia
  // exatamente a mesma saída de um ciclo saudável. A automação ficou parada horas, várias
  // vezes, e o log dizia "ciclo avaliado" o tempo todo. Um ciclo morto tem que PARECER
  // morto para quem lê.
  logger.info(
    { modo, candidatos: resumo.candidatos, elegiveis: resumo.elegiveis, gravadas,
      fontes: resumo.fontes,
      enfileirados: resumo.enfileirados,
      naoEnfileirados: resumo.naoEnfileirados,
      falhas: resumo.falhas.length },
    modo === 'sombra'
      ? '[baixa-auto] ciclo em SOMBRA — nada foi enfileirado'
      : resumo.naoEnfileirados
        ? '[baixa-auto] ciclo avaliado — NADA ENFILEIRADO'
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

/**
 * Executa um ciclo AGORA, a pedido de uma pessoa, em vez de esperar o proximo tique do cron.
 *
 * POR QUE EXISTE: o ciclo agendado é a espinha, mas há dois momentos em que
 * esperar até 10 min é ruim de verdade — logo depois de reativar o posto (que cai
 * a cada deploy) e quando alguém quer ver a automação agir para conferir. Botão
 * que dá resposta imediata é o que transforma "confio que roda" em "vi rodando".
 *
 * NÃO É UM CAMINHO DIFERENTE: chama o MESMO `avaliarCiclo()`, com as mesmas
 * barreiras — posto ativo, teto, fontes saudáveis. Um botão que pulasse qualquer
 * uma delas seria uma segunda regra de negócio escondida atrás de um clique.
 *
 * A trava impede colidir com o ciclo agendado; sem ela, dois ciclos concorrentes
 * poderiam gastar o teto duas vezes.
 */
export async function executarAgora(): Promise<
  { ok: true; resumo: ResumoCiclo } | { ok: false; motivo: string }
> {
  const soltar = await travarExecucao()
  if (!soltar) {
    return {
      ok: false,
      motivo: 'Já existe um ciclo em andamento. Aguarde ele terminar — o resultado aparece na tela.',
    }
  }
  try {
    // ANTES de avaliar: desbloqueia a fila. Um pedido órfão em `executando` impede o
    // agente de pegar QUALQUER coisa nova — de nada adianta enfileirar mais três em
    // cima de uma fila travada. Descoberto em 31/08, depois de 47 h paradas.
    await recuperarPedidosPresos()
    const resumo = await avaliarCiclo()
    logger.info({ ...resumo, paraFila: resumo.paraFila.length }, '[baixa-auto] ciclo disparado manualmente')
    return { ok: true, resumo }
  } finally {
    await soltar()
  }
}
