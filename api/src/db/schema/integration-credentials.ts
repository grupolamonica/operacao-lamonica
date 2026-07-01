import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Credenciais das integrações externas (Angellira, aspx/SPX) num lugar só, pra
 * rotacionar a senha SEM mexer em env/secret/deploy. O auth lê daqui primeiro e
 * cai no env como fallback. Mesmo padrão (senha em coluna) do `aspx_credentials`
 * do Cargas. ⚠️ senha em texto puro — restrinja o acesso ao banco.
 *
 * service: 'angellira' | 'aspx'. login/empresa pré-preenchidos; password vazio
 * (o operador insere via UPDATE). updated_at = quando a senha foi trocada.
 */
export const integrationCredentials = pgTable('integration_credentials', {
  service:   text('service').primaryKey(),       // 'angellira' | 'aspx'
  login:     text('login'),
  password:  text('password'),                    // texto puro (igual aspx_credentials)
  empresa:   text('empresa'),                     // Angellira: company id
  extra:     jsonb('extra').default(sql`'{}'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`now()`),
})
