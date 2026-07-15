/**
 * Cofre de credenciais do rastreador (GR/PR3) — substitui a aba BaseRatreador da
 * planilha (login/senha em texto puro) por armazenamento CIFRADO em repouso.
 *
 * - Cifra: pgcrypto pgp_sym_encrypt/decrypt via SQL cru parametrizado (postgres-js
 *   faz o bind — a chave NUNCA entra como literal, senão vaza em logs de query).
 * - Chave: env RASTREADOR_VAULT_KEY (SÓ backend; nunca logada/retornada).
 * - LIST é MASCARADO (nunca seleciona password_cipher; só um boolean).
 * - REVELAR é FAIL-CLOSED: decifra + grava gr_vault_events NA MESMA transação —
 *   se a trilha falhar, a senha não sai.
 * - Tabelas criadas via SQL aditivo (api/drizzle/gr-vault.sql) — fora do Drizzle.
 */
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'

export interface VaultItem {
  plate: string
  provider: string
  login: string
  username: string
  hasPassword: boolean
  rastreadorId: string | null
  embarcador: string | null
  notes: string | null
  updatedAt: string | null
}

export interface VaultUpsertInput {
  plate: string
  provider?: string
  login?: string
  username?: string
  senha?: string
  rastreadorId?: string
  embarcador?: string
  notes?: string
}

function getVaultKey(): string {
  const key = process.env.RASTREADOR_VAULT_KEY?.trim()
  if (!key) throw new Error('Missing required environment variable: RASTREADOR_VAULT_KEY')
  return key
}

/** Placa normalizada (uppercase, sem hífen/espaço) ou null se inválida. */
export function normalizePlate(raw: string | null | undefined): string | null {
  const p = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/.test(p) ? p : null
}

type Row = Record<string, unknown>
const toIso = (v: unknown): string | null => (v ? new Date(v as string | Date).toISOString() : null)

/** Lista MASCARADA — nunca seleciona password_cipher (só IS NOT NULL). */
export async function listVaultCredentials(): Promise<VaultItem[]> {
  const rows = (await db.execute(sql`
    SELECT plate, provider, login, username,
           (password_cipher IS NOT NULL) AS has_password,
           rastreador_id, embarcador, notes, updated_at
    FROM rastreador_credentials
    ORDER BY plate ASC
  `)) as unknown as Row[]
  return rows.map((r) => ({
    plate: String(r.plate),
    provider: String(r.provider ?? ''),
    login: String(r.login ?? ''),
    username: String(r.username ?? ''),
    hasPassword: r.has_password === true,
    rastreadorId: (r.rastreador_id as string | null) ?? null,
    embarcador: (r.embarcador as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    updatedAt: toIso(r.updated_at),
  }))
}

/**
 * Upsert por placa. Cifra a senha (pgp_sym_encrypt); senha omitida/vazia num
 * registro existente PRESERVA a cifra atual (COALESCE). Audita na mesma transação.
 */
export async function upsertVaultCredential(input: VaultUpsertInput, operatorId: string): Promise<{ plate: string }> {
  const key = getVaultKey()
  const plate = normalizePlate(input.plate)
  if (!plate) throw new Error('Placa de cavalo inválida.')
  const senha = input.senha && input.senha !== '' ? input.senha : null

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO rastreador_credentials
        (plate, provider, login, username, password_cipher, rastreador_id, embarcador, notes, updated_by, updated_at)
      VALUES
        (${plate}, ${input.provider ?? ''}, ${input.login ?? ''}, ${input.username ?? ''},
         CASE WHEN ${senha}::text IS NULL THEN NULL ELSE pgp_sym_encrypt(${senha}::text, ${key}::text) END,
         ${input.rastreadorId ?? null}, ${input.embarcador ?? null}, ${input.notes ?? null}, ${operatorId}::uuid, now())
      ON CONFLICT (plate) DO UPDATE SET
        provider        = EXCLUDED.provider,
        login           = EXCLUDED.login,
        username        = EXCLUDED.username,
        rastreador_id   = EXCLUDED.rastreador_id,
        embarcador      = EXCLUDED.embarcador,
        notes           = EXCLUDED.notes,
        updated_by      = EXCLUDED.updated_by,
        updated_at      = now(),
        -- só troca a senha quando veio uma nova; senão mantém a cifra existente
        password_cipher = COALESCE(EXCLUDED.password_cipher, rastreador_credentials.password_cipher)
    `)
    await tx.execute(sql`
      INSERT INTO gr_vault_events (plate, action, operator_id) VALUES (${plate}, 'upsert', ${operatorId}::uuid)
    `)
  })
  return { plate }
}

/**
 * Revela (decifra) a senha de UMA placa. FAIL-CLOSED: a trilha de auditoria é
 * gravada na MESMA transação — se falhar, a transação aborta e a senha não sai.
 */
export async function revealVaultCredential(rawPlate: string, operatorId: string): Promise<{
  plate: string; provider: string; login: string; username: string; senha: string | null
} | null> {
  const key = getVaultKey()
  const plate = normalizePlate(rawPlate)
  if (!plate) throw new Error('Placa de cavalo inválida.')

  return db.transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT plate, provider, login, username,
             CASE WHEN password_cipher IS NULL THEN NULL
                  ELSE pgp_sym_decrypt(password_cipher, ${key}::text) END AS senha
      FROM rastreador_credentials
      WHERE plate = ${plate}
    `)) as unknown as Row[]
    const row = rows[0]
    if (!row) return null

    await tx.execute(sql`
      INSERT INTO gr_vault_events (plate, action, operator_id) VALUES (${plate}, 'reveal', ${operatorId}::uuid)
    `)

    return {
      plate: String(row.plate),
      provider: String(row.provider ?? ''),
      login: String(row.login ?? ''),
      username: String(row.username ?? ''),
      senha: (row.senha as string | null) ?? null,
    }
  })
}

/** Remove a credencial de uma placa (audita na mesma transação). */
export async function deleteVaultCredential(rawPlate: string, operatorId: string): Promise<boolean> {
  const plate = normalizePlate(rawPlate)
  if (!plate) throw new Error('Placa de cavalo inválida.')
  return db.transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      DELETE FROM rastreador_credentials WHERE plate = ${plate} RETURNING plate
    `)) as unknown as Row[]
    if (rows.length === 0) return false
    await tx.execute(sql`
      INSERT INTO gr_vault_events (plate, action, operator_id) VALUES (${plate}, 'delete', ${operatorId}::uuid)
    `)
    return true
  })
}
