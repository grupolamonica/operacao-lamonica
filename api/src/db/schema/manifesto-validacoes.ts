import { pgTable, uuid, varchar, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

// Validação do sistema pelo operador — ver drizzle/manifesto-validacoes.sql para o "por quê".
//
// Resumo: quando o sistema aponta DESCARREGADO, o operador confirma ou nega. Cada linha carrega a
// FOTO do que o sistema dizia no instante (estado, origem do sinal, evidências), porque o snapshot
// é sobrescrito a cada 5 min e sem essa foto não há como calcular acurácia depois.
//
// Append-only: cada validação é um fato datado; a métrica usa a mais recente por manifesto.
export const manifestoValidacoes = pgTable(
  'manifesto_validacoes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    codman: integer('codman').notNull(),
    filial: integer('filial').notNull(),
    serie: varchar('serie', { length: 10 }).notNull().default(''),

    // a foto do momento — é o que torna a acurácia calculável
    estadoSistema: varchar('estado_sistema', { length: 30 }).notNull(),
    origemEstado: varchar('origem_estado', { length: 10 }),
    evidencias: text('evidencias'),
    comprovacaoTrava: boolean('comprovacao_trava'),
    naFrota: boolean('na_frota'),
    estadoDesde: timestamp('estado_desde', { withTimezone: true }),

    // o veredito
    veredito: varchar('veredito', { length: 20 }).notNull(),
    motivoErro: varchar('motivo_erro', { length: 40 }),
    observacao: text('observacao'),
    baixadoEm: timestamp('baixado_em', { withTimezone: true }),

    placa: varchar('placa', { length: 10 }),
    destino: varchar('destino', { length: 120 }),

    operatorId: uuid('operator_id').references(() => users.id),
    authorName: varchar('author_name', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('manifesto_validacoes_chave_idx').on(t.codman, t.filial, t.serie, t.createdAt.desc()),
    index('manifesto_validacoes_created_idx').on(t.createdAt.desc()),
  ],
)

export type SelectValidacao = typeof manifestoValidacoes.$inferSelect
export type InsertValidacao = typeof manifestoValidacoes.$inferInsert

export const VEREDITOS = ['correto', 'incorreto'] as const
export type Veredito = (typeof VEREDITOS)[number]

// Por que o sistema errou — perguntado SÓ quando o veredito é "incorreto" (decisão Danilo: acerto
// em 1 clique, erro em 2, porque o erro é o que interessa investigar). Validado na API, não no
// banco: acrescentar motivo não deve exigir migration.
export const MOTIVOS_ERRO = {
  ainda_descarregando: 'Ainda estava descarregando',
  ainda_nao_chegou: 'Ainda não chegou no cliente',
  ja_estava_baixado: 'Já estava baixado no Rodopar',
  veio_vazio: 'Veio vazio / não tinha carga',
  outro: 'Outro',
} as const

export type MotivoErro = keyof typeof MOTIVOS_ERRO
