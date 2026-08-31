/**
 * Leitura de erro do Postgres ATRAVÉS dos embrulhos do ORM.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────────
 *
 * Em 31/08/2026 a baixa automática respondeu 500 durante uma hora — o botão
 * "Executar agora" e, junto com ele, o ciclo do cron, que chama a mesma função.
 *
 * A causa foi uma linha que parecia óbvia:
 *
 *     (erro as { code?: string }).code === '23505'
 *
 * O driver (postgres-js) põe o SQLSTATE em `.code`, sim. Mas o drizzle-orm 0.45.2
 * embrulha TODA falha de query num `DrizzleQueryError`, que carrega apenas `query`,
 * `params` e `cause` — nunca `code`. Medido com o drizzle deste repo:
 *
 *     erro cru do driver   →  code = '23505'
 *     DrizzleQueryError    →  code = undefined ,  cause.code = '23505'
 *
 * Consequência: o predicado de "violação de índice único" devolvia `false` para uma
 * violação de índice único. Quem esperava `{ok:false}` recebia exceção; quem não
 * capturava exceção devolvia 500.
 *
 * Esse defeito existia desde o primeiro commit do schema, em abril. Nunca apareceu
 * porque nunca houve colisão de verdade: o teto diário de 3 pedidos mantinha
 * `vagas = 0`, e o laço de insert não chegava a rodar. Subir o teto para 100 não
 * criou o bug — apenas foi a primeira vez que o caminho feliz foi exercitado.
 *
 * ── A LIÇÃO, QUE NÃO É "CUIDADO AO LER .code" ───────────────────────────────────
 *
 * Ler o interior de um erro de driver através de um ORM é acoplamento a detalhe de
 * implementação, e detalhe de implementação muda sem aviso e sem quebrar o build.
 * Um `bun update` do drizzle teria reintroduzido isso silenciosamente.
 *
 * Por isso: UM lugar só, e testado contra o embrulho REAL (`erro-pg.test.ts` importa
 * o `DrizzleQueryError` do pacote instalado). Se uma versão futura mudar a forma do
 * embrulho, o teste falha no CI — não em produção, às 15h, com a fila parada.
 */

/**
 * Fundo de poço da caminhada pela cadeia de `cause`.
 *
 * Oito é folgado: a cadeia real observada tem 2 elos (DrizzleQueryError → PostgresError).
 * O limite existe contra `cause` cíclico, que um `Error` construído à mão pode ter e
 * que travaria o processo num laço infinito dentro de um `catch`.
 */
const PROFUNDIDADE_MAX = 8

/**
 * O SQLSTATE do erro, procurando no objeto e em toda a cadeia de `cause`.
 *
 * Devolve `null` quando não há código nenhum — que é o caso de um erro que não veio
 * do banco. Não tenta adivinhar: quem chama compara com o código que espera.
 */
export function codigoPg(erro: unknown): string | null {
  const vistos = new Set<unknown>()
  let atual: unknown = erro

  for (let i = 0; i < PROFUNDIDADE_MAX && atual != null; i++) {
    if (typeof atual !== 'object' && typeof atual !== 'function') break
    if (vistos.has(atual)) break
    vistos.add(atual)

    const codigo = (atual as { code?: unknown }).code
    if (typeof codigo === 'string' && codigo.length > 0) return codigo

    atual = (atual as { cause?: unknown }).cause
  }

  return null
}

/** `true` se o erro (ou alguma causa dele) tem este SQLSTATE. */
export function ehCodigoPg(erro: unknown, codigo: string): boolean {
  return codigoPg(erro) === codigo
}

/**
 * A cadeia de mensagens, da mais externa para a mais interna, unida por ` ← `.
 *
 * É isto que deve ir para o log, e não `error.message` sozinho. A mensagem de topo de
 * um `DrizzleQueryError` é `"Failed query: insert into manifesto_baixa_pedidos ..."`,
 * que diz o que foi tentado e esconde o motivo. O motivo — `duplicate key value
 * violates unique constraint "manifesto_baixa_pedidos_ativo_idx"` — está na causa.
 *
 * Foi exatamente essa diferença que custou a hora de diagnóstico: o log do container
 * tinha o erro, mas não tinha a razão dele.
 */
export function cadeiaDeErro(erro: unknown, limiteChars = 600): string {
  const vistos = new Set<unknown>()
  const partes: string[] = []
  let atual: unknown = erro

  for (let i = 0; i < PROFUNDIDADE_MAX && atual != null; i++) {
    if (typeof atual === 'object' || typeof atual === 'function') {
      if (vistos.has(atual)) break
      vistos.add(atual)
    }

    const msg =
      atual instanceof Error
        ? atual.message
        : typeof atual === 'string'
          ? atual
          : typeof atual === 'object'
            ? String((atual as { message?: unknown }).message ?? '')
            : String(atual)

    if (msg) partes.push(msg)
    if (typeof atual !== 'object' && typeof atual !== 'function') break
    atual = (atual as { cause?: unknown }).cause
  }

  return partes.join(' ← ').slice(0, limiteChars)
}

/**
 * A mensagem MAIS INTERNA da cadeia — o motivo, sem o que foi tentado em volta.
 *
 * Existe porque truncar a cadeia é perigoso do lado errado: a mensagem de topo do
 * drizzle é a query inteira mais os params, então `cadeiaDeErro(e, 200)` devolve 200
 * caracteres de SQL e joga fora exatamente o `duplicate key value violates ...` que
 * interessa. Quem tem pouco espaço (a tela, um campo de resumo) quer ISTO, não aquilo.
 */
export function motivoRaiz(erro: unknown, limiteChars = 200): string {
  const vistos = new Set<unknown>()
  let ultima = ''
  let atual: unknown = erro

  for (let i = 0; i < PROFUNDIDADE_MAX && atual != null; i++) {
    if (typeof atual === 'object' || typeof atual === 'function') {
      if (vistos.has(atual)) break
      vistos.add(atual)
    }

    const msg =
      atual instanceof Error
        ? atual.message
        : typeof atual === 'string'
          ? atual
          : typeof atual === 'object'
            ? String((atual as { message?: unknown }).message ?? '')
            : String(atual)

    if (msg) ultima = msg
    if (typeof atual !== 'object' && typeof atual !== 'function') break
    atual = (atual as { cause?: unknown }).cause
  }

  return ultima.slice(0, limiteChars)
}

/**
 * O pacote pronto para `logger.error`: o motivo raiz, a cadeia inteira, o SQLSTATE e a
 * constraint envolvida quando o Postgres informa qual foi.
 *
 * `motivo` vem separado de propósito: `erro` é a cadeia e pode ser cortada pelo
 * tamanho, mas o motivo precisa sobreviver ao corte — é ele que responde a pergunta.
 * `constraint` responde "qual índice barrou" sem mais nenhuma consulta; em 31/08 essa
 * única palavra teria resolvido o diagnóstico.
 */
export function detalharErro(erro: unknown): {
  motivo: string
  erro: string
  sqlstate: string | null
  constraint: string | null
} {
  const vistos = new Set<unknown>()
  let constraint: string | null = null
  let atual: unknown = erro

  for (let i = 0; i < PROFUNDIDADE_MAX && atual != null; i++) {
    if (typeof atual !== 'object' && typeof atual !== 'function') break
    if (vistos.has(atual)) break
    vistos.add(atual)

    const c = (atual as { constraint_name?: unknown; constraint?: unknown })
    const achado = c.constraint_name ?? c.constraint
    if (typeof achado === 'string' && achado.length > 0) {
      constraint = achado
      break
    }
    atual = (atual as { cause?: unknown }).cause
  }

  return { motivo: motivoRaiz(erro), erro: cadeiaDeErro(erro), sqlstate: codigoPg(erro), constraint }
}
