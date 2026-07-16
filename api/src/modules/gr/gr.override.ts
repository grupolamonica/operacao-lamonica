/**
 * Override manual + Observação do operador (col AA + dropdowns do PainelGR).
 * 1 registro por viagem (lh): anotar e/ou liberar com ressalva. Toda escrita
 * grava trilha em gr_override_events NA MESMA transação (padrão gr_vault_events).
 * Tabelas criadas via SQL aditivo (api/drizzle/gr-override.sql) — fora do Drizzle.
 */
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'

export interface RowOverride {
  lh: string
  liberado: boolean
  observacao: string | null
  updatedAt: string | null
}

export interface OverrideUpsertInput {
  lh: string
  liberado?: boolean
  observacao?: string
}

type Row = Record<string, unknown>
const toIso = (v: unknown): string | null => (v ? new Date(v as string | Date).toISOString() : null)

/**
 * Overrides das viagens informadas (lh → override).
 * IN com parâmetros individuais via sql.join — `= ANY(${array})` NÃO funciona
 * neste caminho (drizzle stringifica o array JS → "op ANY/ALL requires array"
 * em todo request; derrubou a matriz inteira em prod, 16/07).
 * Leitura é RESILIENTE: se falhar, loga e devolve vazio — a matriz não morre
 * por causa da camada de override (escritas continuam falhando alto).
 */
export async function fetchOverridesByLh(lhs: string[]): Promise<Map<string, RowOverride>> {
  const uniq = [...new Set(lhs.filter((v) => !!v))]
  const map = new Map<string, RowOverride>()
  if (uniq.length === 0) return map
  try {
    const params = sql.join(uniq.map((l) => sql`${l}`), sql`, `)
    const rows = (await db.execute(sql`
      SELECT lh, liberado, observacao, updated_at
      FROM gr_row_override
      WHERE lh IN (${params})
    `)) as unknown as Row[]
    for (const r of rows) {
      map.set(String(r.lh), {
        lh: String(r.lh),
        liberado: r.liberado === true,
        observacao: (r.observacao as string | null) ?? null,
        updatedAt: toIso(r.updated_at),
      })
    }
  } catch (err) {
    // Sem PII: só o tipo do erro. A matriz segue sem overrides neste request.
    console.error('[gr.override] fetchOverridesByLh falhou:', err instanceof Error ? err.message : 'erro')
  }
  return map
}

/** Upsert (anotação e/ou liberação) + trilha na mesma transação. */
export async function upsertRowOverride(input: OverrideUpsertInput, operatorId: string): Promise<RowOverride> {
  const lh = String(input.lh ?? '').trim()
  if (!lh) throw new Error('lh obrigatório.')
  const liberado = input.liberado === true
  const observacao = input.observacao?.trim() || null

  return db.transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      INSERT INTO gr_row_override (lh, liberado, observacao, updated_by, updated_at)
      VALUES (${lh}, ${liberado}, ${observacao}, ${operatorId}::uuid, now())
      ON CONFLICT (lh) DO UPDATE SET
        liberado = EXCLUDED.liberado,
        observacao = EXCLUDED.observacao,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      RETURNING lh, liberado, observacao, updated_at
    `)) as unknown as Row[]
    await tx.execute(sql`
      INSERT INTO gr_override_events (lh, action, liberado, observacao, operator_id)
      VALUES (${lh}, 'upsert', ${liberado}, ${observacao}, ${operatorId}::uuid)
    `)
    const r = rows[0]!
    return {
      lh: String(r.lh),
      liberado: r.liberado === true,
      observacao: (r.observacao as string | null) ?? null,
      updatedAt: toIso(r.updated_at),
    }
  })
}

/** Remove o override de uma viagem (auditado). */
export async function deleteRowOverride(lhRaw: string, operatorId: string): Promise<boolean> {
  const lh = String(lhRaw ?? '').trim()
  if (!lh) throw new Error('lh obrigatório.')
  return db.transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      DELETE FROM gr_row_override WHERE lh = ${lh} RETURNING lh
    `)) as unknown as Row[]
    if (rows.length === 0) return false
    await tx.execute(sql`
      INSERT INTO gr_override_events (lh, action, operator_id)
      VALUES (${lh}, 'delete', ${operatorId}::uuid)
    `)
    return true
  })
}
