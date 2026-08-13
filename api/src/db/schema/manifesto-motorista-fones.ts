import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

// Telefones do motorista gerenciados pelo operador — ver drizzle/manifesto-motorista-fones.sql
// para o "por quê" completo. Resumo:
//
// O telefone vem do Rodopar dentro do snapshot, que vive no Redis e é SOBRESCRITO a cada 5 min.
// Não escrevemos no Rodopar e não usamos drivers.phone (nenhuma rota da API escreve lá). Então
// tabela lateral chaveada pelo RODMOT.CODMOT — o número segue o MOTORISTA, não o manifesto.
//
// Um número que veio do Rodopar não é uma linha nossa: riscá-lo cria a linha com
// origem='rodopar', que existe só para carregar o estado. A tela cruza por fone_digitos.
//
// Estado (nao_funciona) + eventos, no molde gr_row_override/gr_override_events — não append-only
// como manifesto_tratativas, porque aqui existe estado que a tela lê a cada 30 s e o desfazer
// precisa de trilha.
export const manifestoMotoristaFones = pgTable(
  'manifesto_motorista_fones',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    // varchar e não integer: CODMOT pode vir como char com padding do Rodopar
    codmot: varchar('codmot', { length: 20 }).notNull(),
    // forma canônica (digitosFone) — é ela que deduplica Rodopar × digitado
    foneDigitos: varchar('fone_digitos', { length: 20 }).notNull(),
    numero: varchar('numero', { length: 40 }).notNull(),
    rotulo: varchar('rotulo', { length: 40 }).notNull().default('Celular'),
    origem: varchar('origem', { length: 10 }).notNull().default('operador'),
    naoFunciona: boolean('nao_funciona').notNull().default(false),
    motoristaNome: varchar('motorista_nome', { length: 120 }),
    createdBy: uuid('created_by').references(() => users.id),
    createdByName: varchar('created_by_name', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedBy: uuid('updated_by').references(() => users.id),
    updatedByName: varchar('updated_by_name', { length: 120 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('manifesto_motorista_fones_chave_idx').on(t.codmot, t.foneDigitos)],
)

export const manifestoMotoristaFoneEventos = pgTable(
  'manifesto_motorista_fone_eventos',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    codmot: varchar('codmot', { length: 20 }).notNull(),
    foneDigitos: varchar('fone_digitos', { length: 20 }).notNull(),
    acao: varchar('acao', { length: 30 }).notNull(),
    numero: varchar('numero', { length: 40 }),
    rotulo: varchar('rotulo', { length: 40 }),
    origem: varchar('origem', { length: 10 }),
    operatorId: uuid('operator_id').references(() => users.id),
    authorName: varchar('author_name', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('manifesto_motorista_fone_eventos_chave_idx').on(t.codmot, t.foneDigitos, t.createdAt.desc()),
  ],
)

export type SelectMotoristaFone = typeof manifestoMotoristaFones.$inferSelect
export type InsertMotoristaFone = typeof manifestoMotoristaFones.$inferInsert

// Rótulos oferecidos ao operador (decisão Danilo 13/08: lista curta, não campo livre).
// Validado na API, não no banco — acrescentar rótulo não deve exigir migration.
export const ROTULOS_FONE = ['Celular', 'WhatsApp', 'Recado', 'Outro'] as const
export type RotuloFone = (typeof ROTULOS_FONE)[number]

export const ORIGENS_FONE = ['operador', 'rodopar'] as const
export const ACOES_FONE = ['criou', 'marcou_nao_funciona', 'desmarcou'] as const
