import { describe, expect, it } from 'bun:test'
import { DrizzleQueryError } from 'drizzle-orm'
import { cadeiaDeErro, codigoPg, detalharErro, ehCodigoPg, motivoRaiz } from './erro-pg'

/**
 * Estes testes existem por causa do incidente de 31/08/2026 (500 na baixa automática).
 *
 * O ponto central é o bloco "o embrulho REAL do drizzle": ele importa o
 * `DrizzleQueryError` do pacote instalado em vez de imitar a forma dele. Um teste que
 * fabricasse `{ cause: { code } }` à mão passaria para sempre e não protegeria de nada —
 * o defeito original foi justamente uma suposição errada sobre a forma do erro.
 *
 * Se um `bun update` trouxer um drizzle que embrulhe diferente, é aqui que quebra.
 */

/** Uma violação de índice único como o postgres-js entrega. */
function violacaoUnica(constraint = 'manifesto_baixa_pedidos_ativo_idx') {
  return Object.assign(
    new Error(`duplicate key value violates unique constraint "${constraint}"`),
    { code: '23505', constraint_name: constraint, severity: 'ERROR' },
  )
}

describe('codigoPg — o embrulho REAL do drizzle', () => {
  it('acha o 23505 dentro de um DrizzleQueryError de verdade', () => {
    const embrulhado = new DrizzleQueryError(
      'insert into "manifesto_baixa_pedidos" ...',
      [],
      violacaoUnica(),
    )

    // A regressão que causou o incidente: ler .code no topo devolve undefined.
    expect((embrulhado as unknown as { code?: string }).code).toBeUndefined()
    // E o que o helper precisa entregar:
    expect(codigoPg(embrulhado)).toBe('23505')
    expect(ehCodigoPg(embrulhado, '23505')).toBe(true)
  })

  it('continua achando se o drizzle deixar de embrulhar um dia', () => {
    expect(codigoPg(violacaoUnica())).toBe('23505')
  })

  it('acha através de dois embrulhos', () => {
    const dentro = new DrizzleQueryError('q', [], violacaoUnica())
    const fora = new Error('camada de cima', { cause: dentro })
    expect(codigoPg(fora)).toBe('23505')
  })

  it('não confunde tabela ausente com violação única', () => {
    const faltando = Object.assign(new Error('relation "x" does not exist'), { code: '42P01' })
    expect(codigoPg(new DrizzleQueryError('q', [], faltando))).toBe('42P01')
    expect(ehCodigoPg(new DrizzleQueryError('q', [], faltando), '23505')).toBe(false)
  })
})

describe('codigoPg — entradas que não são erro de banco', () => {
  it('devolve null para erro comum, null, undefined e string', () => {
    expect(codigoPg(new Error('qualquer coisa'))).toBeNull()
    expect(codigoPg(null)).toBeNull()
    expect(codigoPg(undefined)).toBeNull()
    expect(codigoPg('falhou')).toBeNull()
    expect(codigoPg(42)).toBeNull()
  })

  it('ignora code vazio e code que não é string', () => {
    expect(codigoPg({ code: '' })).toBeNull()
    expect(codigoPg({ code: 23505 })).toBeNull()
  })

  it('não trava com cause cíclico', () => {
    const a: { cause?: unknown } = {}
    const b: { cause?: unknown } = { cause: a }
    a.cause = b
    expect(codigoPg(a)).toBeNull() // o que importa é TERMINAR
  })

  it('não trava com cause apontando para si mesmo', () => {
    const a: { cause?: unknown } = {}
    a.cause = a
    expect(codigoPg(a)).toBeNull()
  })

  it('desiste depois da profundidade máxima em vez de varrer para sempre', () => {
    let atual: unknown = { code: '23505' }
    for (let i = 0; i < 30; i++) atual = { cause: atual }
    expect(codigoPg(atual)).toBeNull()
  })
})

describe('cadeiaDeErro — o motivo, não só o que foi tentado', () => {
  it('junta a mensagem de topo com a razão que estava escondida', () => {
    const texto = cadeiaDeErro(
      new DrizzleQueryError('insert into "manifesto_baixa_pedidos" ...', [], violacaoUnica()),
    )
    // O que o log mostrava antes — útil, mas não é o motivo:
    expect(texto).toContain('Failed query')
    // O que faltava, e é o diagnóstico inteiro numa linha:
    expect(texto).toContain('duplicate key value violates unique constraint')
    expect(texto).toContain('manifesto_baixa_pedidos_ativo_idx')
  })

  it('corta em limiteChars para não despejar query gigante no log', () => {
    const gigante = new DrizzleQueryError('x'.repeat(5000), [], violacaoUnica())
    expect(cadeiaDeErro(gigante, 200).length).toBeLessThanOrEqual(200)
  })

  it('aguenta null, string e objeto sem message', () => {
    expect(cadeiaDeErro(null)).toBe('')
    expect(cadeiaDeErro('deu ruim')).toBe('deu ruim')
    expect(typeof cadeiaDeErro({})).toBe('string')
  })
})

describe('motivoRaiz — o motivo sobrevive ao corte', () => {
  it('devolve a mensagem interna, não a query de fora', () => {
    const m = motivoRaiz(new DrizzleQueryError('insert into ... '.repeat(50), [], violacaoUnica()))
    expect(m).toContain('duplicate key value violates unique constraint')
    expect(m).not.toContain('insert into')
  })

  it('é isto que cadeiaDeErro cortada PERDERIA', () => {
    // A armadilha, explícita: com query longa, cortar a cadeia guarda o SQL e joga
    // fora a razão. Foi o defeito que quase entrou no próprio fix de 31/08.
    const e = new DrizzleQueryError('insert into "manifesto_baixa_pedidos" '.repeat(20), [], violacaoUnica())
    expect(cadeiaDeErro(e, 200)).not.toContain('duplicate key')
    expect(motivoRaiz(e)).toContain('duplicate key')
  })

  it('aguenta erro sem causa, string e null', () => {
    expect(motivoRaiz(new Error('sozinho'))).toBe('sozinho')
    expect(motivoRaiz('texto')).toBe('texto')
    expect(motivoRaiz(null)).toBe('')
  })

  it('não trava com cause cíclico', () => {
    const a: { message?: string; cause?: unknown } = { message: 'a' }
    a.cause = a
    expect(motivoRaiz(a)).toBe('a')
  })
})

describe('detalharErro — o pacote que vai para o logger', () => {
  it('entrega motivo, sqlstate e a constraint que barrou', () => {
    const d = detalharErro(new DrizzleQueryError('q', [], violacaoUnica()))
    expect(d.sqlstate).toBe('23505')
    expect(d.constraint).toBe('manifesto_baixa_pedidos_ativo_idx')
    expect(d.erro).toContain('duplicate key')
    expect(d.motivo).toContain('duplicate key')
  })

  it('não inventa constraint quando o erro não tem', () => {
    const d = detalharErro(new Error('erro qualquer'))
    expect(d.sqlstate).toBeNull()
    expect(d.constraint).toBeNull()
    expect(d.motivo).toBe('erro qualquer')
  })
})
