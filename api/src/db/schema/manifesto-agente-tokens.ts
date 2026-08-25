import { pgTable, uuid, varchar, char, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

// Token do agente — ver drizzle/manifesto-agente-tokens.sql para o "por quê" completo.
//
// Resumo: liga a PESSOA que usa a tela ao ROBÔ que roda no PC dela. Antes disto o
// agente autenticava com uma chave global, a mesma do coletor Sascar, e o campo
// `agente` era string livre que a máquina se auto-declarava.
//
// Só o hash é guardado. O valor aparece uma vez, na hora de gerar, e nunca mais.
export const manifestoAgenteTokens = pgTable(
  'manifesto_agente_tokens',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** sha256 do token em hex. O valor nunca é gravado. */
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    /** primeiros caracteres, para a pessoa reconhecer qual é qual na lista */
    prefixo: varchar('prefixo', { length: 12 }).notNull(),
    /** de quem é a máquina, escrito pela pessoa. Só leitura humana. */
    apelido: varchar('apelido', { length: 60 }),

    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    usadoEm: timestamp('usado_em', { withTimezone: true }),
    revogadoEm: timestamp('revogado_em', { withTimezone: true }),
    revogadoPor: uuid('revogado_por').references(() => users.id),
  },
  (t) => ({
    hashIdx: uniqueIndex('manifesto_agente_tokens_hash_idx').on(t.tokenHash),
    // ⚠️ O índice de "um ativo por pessoa" é PARCIAL (WHERE revogado_em IS NULL) e o
    // Drizzle não o expressa. Ele vive só no .sql, como os dois de
    // manifesto-baixa-pedidos. Um `drizzle-kit push` a partir daqui NÃO o recria —
    // migrations deste projeto são manuais, pelo workflow db-migrate.yml.
  }),
)

export type ManifestoAgenteToken = typeof manifestoAgenteTokens.$inferSelect
