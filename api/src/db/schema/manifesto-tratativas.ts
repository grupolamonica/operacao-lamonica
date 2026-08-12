import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

// Justificativa do operador na tela /baixa-manifesto (ver drizzle/manifesto-tratativas.sql).
//
// O manifesto NÃO tem entidade no banco: o snapshot vive no Redis e é sobrescrito a cada
// ciclo de 5 min do coletor. Por isso a nota é chaveada pela chave natural do Rodopar
// (codman + filial + serie) e não por FK. Append-only: nada é editado nem apagado.
export const manifestoTratativas = pgTable(
  'manifesto_tratativas',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    codman: integer('codman').notNull(),
    filial: integer('filial').notNull(),
    // '' quando o manifesto não tem série — nunca NULL, senão a chave composta não casa
    serie: varchar('serie', { length: 10 }).notNull().default(''),
    // denormalizados no instante da nota: o snapshot já mudou quando alguém ler o histórico
    placa: varchar('placa', { length: 10 }),
    destino: varchar('destino', { length: 120 }),
    motivo: varchar('motivo', { length: 40 }).notNull(),
    notes: text('notes'),
    operatorId: uuid('operator_id').references(() => users.id),
    // mantém a nota legível mesmo se o usuário for removido (igual author_name em treatments)
    authorName: varchar('author_name', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('manifesto_tratativas_chave_idx').on(t.codman, t.filial, t.serie, t.createdAt.desc()),
    index('manifesto_tratativas_created_idx').on(t.createdAt.desc()),
  ],
)

export type SelectManifestoTratativa = typeof manifestoTratativas.$inferSelect
export type InsertManifestoTratativa = typeof manifestoTratativas.$inferInsert

// Lista fechada, validada na API (não no banco: acrescentar motivo não deve exigir
// migration). O rótulo é o que aparece no seletor da tela e no relatório.
export const MOTIVOS_TRATATIVA = {
  aguardando_cliente: 'Aguardando o cliente',
  fila_doque: 'Fila no doque',
  documentacao: 'Documentação / nota fiscal',
  problema_veiculo: 'Problema no veículo ou carreta',
  divergencia_carga: 'Divergência de carga',
  erro_sistema: 'Erro de sistema ou dado incorreto',
  outro: 'Outro',
} as const

export type MotivoTratativa = keyof typeof MOTIVOS_TRATATIVA
