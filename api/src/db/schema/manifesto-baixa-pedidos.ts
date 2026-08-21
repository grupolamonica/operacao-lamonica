import { pgTable, uuid, varchar, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

// Fila de pedidos de baixa de manifesto — ver drizzle/manifesto-baixa-pedidos.sql
// para o "por quê" completo.
//
// Resumo: o operador aperta o botão, o robô (repo robo-baixa-manifesto) executa. A
// fila existe porque o robô não é API — ele dirige o Rodopar pelo canvas do
// RemoteApp e leva dezenas de segundos até o banco confirmar.
//
// O estado que justifica a tabela é `conferencia`: rc 6 e 11 do robô querem dizer
// "pode ter gravado, uma PESSOA precisa conferir". Nunca volta pra fila sozinho.
export const manifestoBaixaPedidos = pgTable(
  'manifesto_baixa_pedidos',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    codman: integer('codman').notNull(),
    filial: integer('filial').notNull(),
    serie: varchar('serie', { length: 10 }).notNull().default(''),

    situacao: varchar('situacao', { length: 20 }).notNull().default('na_fila'),

    // quem pediu — só existe aqui: o Rodopar carimba USUEFE='AGENDADOR' tanto pro
    // robô quanto pra pessoa, e não distingue os dois
    operatorId: uuid('operator_id').references(() => users.id),
    authorName: varchar('author_name', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

    // execução
    reivindicadoEm: timestamp('reivindicado_em', { withTimezone: true }),
    agente: varchar('agente', { length: 120 }),
    concluidoEm: timestamp('concluido_em', { withTimezone: true }),
    rc: integer('rc'),
    mensagem: text('mensagem'),
    efetuarClicado: boolean('efetuar_clicado'),

    // foto do momento (o snapshot do Redis é sobrescrito a cada 5 min)
    placa: varchar('placa', { length: 10 }),
    destino: varchar('destino', { length: 120 }),
    estadoSistema: varchar('estado_sistema', { length: 30 }),
  },
  (t) => [
    index('manifesto_baixa_pedidos_chave_idx').on(t.codman, t.filial, t.serie, t.createdAt.desc()),
    // ⚠️ Os dois índices que fazem o trabalho de verdade são UNIQUE PARCIAIS e vivem
    // só no .sql (migrations aqui são manuais):
    //   _ativo_idx     — UM pedido ativo por manifesto (na_fila|executando|conferencia)
    //   _um_por_vez_idx — UM executando no mundo (Rodopar é sessão única)
    // Ambos são guard-rails de corrida: regra de unicidade em código de aplicação
    // perde para dois operadores clicando ao mesmo tempo.
  ],
)

export type SelectBaixaPedido = typeof manifestoBaixaPedidos.$inferSelect
export type InsertBaixaPedido = typeof manifestoBaixaPedidos.$inferInsert

export const SITUACOES_PEDIDO = [
  'na_fila',
  'executando',
  'concluido',
  'falhou',
  'conferencia',
  'cancelado',
] as const
export type SituacaoPedido = (typeof SITUACOES_PEDIDO)[number]

//: Situações que bloqueiam um pedido NOVO para o mesmo manifesto.
export const SITUACOES_ATIVAS: readonly SituacaoPedido[] = ['na_fila', 'executando', 'conferencia']

//: Códigos de saída do robô que NUNCA voltam pra fila automaticamente — o Efetuar
//: pode ter sido clicado e o banco do Rodopar não confirmou. Repetir duplica
//: lançamento. Ver docs/CONVENCAO-ROBO.md §3 no repo do robô.
//:   6  = conferência humana pendente (clique em aberto de execução anterior)
//:   11 = efetuou na tela e o banco não confirmou
export const RC_EXIGE_CONFERENCIA = [6, 11] as const
