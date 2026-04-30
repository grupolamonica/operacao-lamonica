import { pgTable, uuid, varchar, date } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { drivers } from './drivers'

export const driverDocuments = pgTable('driver_documents', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  driverId:  uuid('driver_id').references(() => drivers.id, { onDelete: 'cascade' }).notNull(),
  type:      varchar('type', { length: 50 }).notNull(),      // CNH, Exame Toxicológico, Treinamento Defensivo
  status:    varchar('status', { length: 20 }).notNull(),    // valido|vence_em_breve|vencido
  expiresAt: date('expires_at'),
  issuedAt:  date('issued_at'),
})

export type SelectDriverDocument = typeof driverDocuments.$inferSelect
export type InsertDriverDocument = typeof driverDocuments.$inferInsert
