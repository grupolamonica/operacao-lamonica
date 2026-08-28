import { pgTable, uuid, varchar, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { manifestoBaixaPedidos } from './manifesto-baixa-pedidos'

// Avaliações da baixa automática — ver drizzle/manifesto-baixa-automacao.sql para
// o "por quê" completo.
//
// Resumo: TODA avaliação do job vira uma linha aqui, inclusive as que reprovaram.
// É isso que torna o falso positivo mensurável — gravar só o desfecho e esquecer a
// afirmação faz o denominador desaparecer, e sem denominador não há taxa de erro,
// só anedota.
//
// Separada de manifesto_baixa_pedidos porque a maioria das avaliações NUNCA vira
// pedido (reprovou, teto cheio, ou o modo era sombra). Misturar as duas faria a
// tabela de pedidos mentir sobre quantas baixas foram efetivamente pedidas.
export const manifestoBaixaAutoAvaliacoes = pgTable(
  'manifesto_baixa_auto_avaliacoes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    avaliadoEm: timestamp('avaliado_em', { withTimezone: true }).defaultNow().notNull(),

    codman: integer('codman').notNull(),
    filial: integer('filial').notNull(),
    serie: varchar('serie', { length: 10 }).notNull(),

    // 'sombra' enquanto MANIFESTO_BAIXA_AUTO_ENABLED=false; 'real' depois. Existe
    // para que a virada de F2 p/ F3 seja legível na própria série histórica: sem
    // ela, "a precisão melhorou" e "mudamos de modo" ficam indistinguíveis.
    modo: varchar('modo', { length: 10 }).notNull(),

    elegivel: boolean('elegivel').notNull(),
    regra: varchar('regra', { length: 40 }),
    reprovas: jsonb('reprovas').$type<string[]>(),

    // a foto do que o CLIENTE dizia — a evidência que sustenta a afirmação
    referenciaCliente: varchar('referencia_cliente', { length: 60 }),
    clienteStatus: varchar('cliente_status', { length: 40 }),
    clienteCarimbo: timestamp('cliente_carimbo', { withTimezone: true }),

    // frescor da fonte NO MOMENTO da avaliação. Fonte congelada responde 200 com
    // dado velho; sem este campo, uma sequência de avaliações erradas fica
    // indistinguível de uma sequência correta quando se olha a série depois.
    fonteIdadeSeg: integer('fonte_idade_seg'),

    guardas: jsonb('guardas').$type<Record<string, unknown>>(),

    // preenchido quando a avaliação virou pedido de verdade (F3). Null em sombra e
    // em avaliação reprovada. É o que liga afirmação -> ato -> desfecho.
    pedidoId: uuid('pedido_id').references(() => manifestoBaixaPedidos.id, { onDelete: 'set null' }),

    // identidade do ciclo, preenchida pela aplicação. Coluna e não expressão no
    // índice: date_trunc sobre timestamptz é STABLE e o Postgres recusa indexá-la.
    ciclo: timestamp('ciclo', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('manifesto_baixa_auto_avaliacoes_chave_idx').on(t.codman, t.filial, t.serie, t.avaliadoEm.desc()),
    // ⚠️ O índice que faz o trabalho de verdade é UNIQUE e vive só no .sql:
    //   _ciclo_idx — UMA avaliação por manifesto por ciclo. Sem ele, retry ou dois
    //   workers sobrepostos inflam a série e a taxa medida sobre ela fica errada
    //   em silêncio, que é o pior modo de estar errado.
  ],
)

export type SelectBaixaAutoAvaliacao = typeof manifestoBaixaAutoAvaliacoes.$inferSelect
export type InsertBaixaAutoAvaliacao = typeof manifestoBaixaAutoAvaliacoes.$inferInsert

/** Modo do job. Sombra grava a afirmação e NÃO enfileira nada. */
export const MODOS_BAIXA_AUTO = ['sombra', 'real'] as const
export type ModoBaixaAuto = (typeof MODOS_BAIXA_AUTO)[number]

/** Origem de um pedido de baixa. 'humano' é o default de toda linha que já existia. */
export const ORIGENS_PEDIDO = ['humano', 'spx', 'galileu'] as const
export type OrigemPedido = (typeof ORIGENS_PEDIDO)[number]
