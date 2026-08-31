import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  date,
  jsonb,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'

/**
 * Oportunidades de Carga — DC-560 (modelo) + DC-565 (margem v1).
 *
 * Ofertas de carga captadas em grupos de WhatsApp, sites de frete e contato com
 * clientes, registradas para serem COMPARÁVEIS entre si antes do aceite. É dado
 * ORIGINAL da torre — não é cache de sistema nenhum (ver oportunidades-carga.sql).
 *
 * Tabela criada via SQL aditivo; drizzle-kit não gere (regra do projeto: nada de
 * db:push em produção).
 */
export const oportunidadesCarga = pgTable(
  'oportunidades_carga',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

    // Texto livre: a oferta chega como o remetente escreveu. A normalização para
    // casar a distância acontece na leitura, não na escrita.
    origem: varchar('origem', { length: 160 }).notNull(),
    destino: varchar('destino', { length: 160 }).notNull(),

    cliente: varchar('cliente', { length: 160 }),
    valorFrete: numeric('valor_frete', { precision: 12, scale: 2 }).notNull(),
    dataCarregamento: date('data_carregamento'),
    tipoVeiculo: varchar('tipo_veiculo', { length: 40 }).notNull(),

    fonte: varchar('fonte', { length: 20 }).notNull(),
    fonteReferencia: text('fonte_referencia'),

    status: varchar('status', { length: 20 }).notNull().default('nova'),
    motivoDescarte: text('motivo_descarte'),

    modalidade: varchar('modalidade', { length: 10 }).notNull().default('terceiro'),

    // Precede a distância derivada do histórico: quem olha a oferta sabe mais que a média.
    distanciaKmManual: numeric('distancia_km_manual', { precision: 10, scale: 2 }),

    margemValor: numeric('margem_valor', { precision: 12, scale: 2 }),
    margemPercentual: numeric('margem_percentual', { precision: 6, scale: 2 }),
    margemMemoria: jsonb('margem_memoria'),
    margemVersao: varchar('margem_versao', { length: 10 }),
    margemCalculadaEm: timestamp('margem_calculada_em', { withTimezone: true }),

    observacoes: text('observacoes'),

    criadoPor: uuid('criado_por').references(() => users.id),
    criadoPorNome: varchar('criado_por_nome', { length: 120 }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('oportunidades_carga_status_idx').on(t.status, t.criadoEm.desc()),
    index('oportunidades_carga_data_idx').on(t.dataCarregamento.desc()),
    index('oportunidades_carga_cliente_idx').on(t.cliente, t.criadoEm.desc()),
    index('oportunidades_carga_fonte_idx').on(t.fonte, t.criadoEm.desc()),
  ],
)

export type SelectOportunidadeCarga = typeof oportunidadesCarga.$inferSelect
export type InsertOportunidadeCarga = typeof oportunidadesCarga.$inferInsert

/**
 * Custo por km de REFERÊNCIA — v1, temporária.
 *
 * Substituída pela tabela real do Motor de Custo Único (DC-557) sem que o contrato
 * do endpoint de margem mude. Nasce vazia: sem custo vigente a margem não é
 * calculada e o serviço diz isso, em vez de inventar um número.
 */
export const oportunidadeCustoKmV1 = pgTable(
  'oportunidade_custo_km_v1',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tipoVeiculo: varchar('tipo_veiculo', { length: 40 }).notNull(),
    modalidade: varchar('modalidade', { length: 10 }).notNull(),
    custoKm: numeric('custo_km', { precision: 10, scale: 4 }).notNull(),
    vigenciaInicio: date('vigencia_inicio').notNull(),
    // Procedência do número — a margem é conferida contra cálculo manual do
    // Welisson/Eduardo, e sem isso não dá para reconciliar.
    fonteNota: text('fonte_nota'),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('oportunidade_custo_km_v1_vigencia_uk').on(t.tipoVeiculo, t.modalidade, t.vigenciaInicio),
    index('oportunidade_custo_km_v1_vigente_idx').on(t.tipoVeiculo, t.modalidade, t.vigenciaInicio.desc()),
  ],
)

export type SelectOportunidadeCustoKm = typeof oportunidadeCustoKmV1.$inferSelect
export type InsertOportunidadeCustoKm = typeof oportunidadeCustoKmV1.$inferInsert

// ── Listas fechadas ───────────────────────────────────────────────────────────
// Validadas na API e não no banco: acrescentar uma fonte ou um status não deve
// exigir migration (mesma decisão de MOTIVOS_TRATATIVA). O rótulo é o que aparece
// na tela e no relatório.

export const FONTES_OPORTUNIDADE = {
  whatsapp: 'Grupo de WhatsApp',
  site: 'Site de frete',
  cliente: 'Contato com cliente',
  manual: 'Registro manual',
} as const

export type FonteOportunidade = keyof typeof FONTES_OPORTUNIDADE

export const STATUS_OPORTUNIDADE = {
  nova: 'Nova',
  analisada: 'Analisada',
  aceita: 'Aceita',
  descartada: 'Descartada',
} as const

export type StatusOportunidade = keyof typeof STATUS_OPORTUNIDADE

export const MODALIDADES_OPORTUNIDADE = {
  proprio: 'Frota própria',
  terceiro: 'Terceiro',
} as const

export type ModalidadeOportunidade = keyof typeof MODALIDADES_OPORTUNIDADE

export function fonteValida(valor: string): valor is FonteOportunidade {
  return Object.hasOwn(FONTES_OPORTUNIDADE, valor)
}

export function statusValido(valor: string): valor is StatusOportunidade {
  return Object.hasOwn(STATUS_OPORTUNIDADE, valor)
}

export function modalidadeValida(valor: string): valor is ModalidadeOportunidade {
  return Object.hasOwn(MODALIDADES_OPORTUNIDADE, valor)
}
