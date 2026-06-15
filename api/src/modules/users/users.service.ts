import bcrypt from 'bcrypt'
import { asc, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { users } from '../../db/schema/users'

/**
 * Users service — Phase 6, plan 06-03.
 *
 * Decisions:
 *  - D-18: soft delete only (isActive=false), never hard delete.
 *  - D-14: notification_preferences is per-user JSONB; user can update own
 *    prefs via dedicated endpoint (no admin elevation needed for self).
 *  - bcrypt cost factor 10 (matches auth.service.ts).
 *
 * SECURITY:
 *  - `passwordHash` MUST never be returned from any function below.
 *  - All projection helpers drop the column explicitly (defense in depth
 *    against accidental `select *` leaks).
 */
const BCRYPT_COST = 10

type Role = 'admin' | 'supervisor' | 'analyst' | 'viewer'

export type NotificationPreferences = {
  critico?: boolean
  medio?:   boolean
  baixo?:   boolean
  // "Marcar como lida" do sino: instante (ISO) em que o usuário viu as notificações.
  // Não-lidas = ocorrências abertas com occurredAt > seenAt. Guardado no MESMO JSONB
  // (sem coluna nova) — chave arbitrária preservada pelo merge.
  seenAt?:  string
}

type UserProjection = {
  id:    string
  name:  string
  email: string
  role:  string
  isActive: boolean
  notificationPreferences: unknown
  createdAt: Date
}

function project(row: typeof users.$inferSelect): UserProjection {
  return {
    id:        row.id,
    name:      row.name,
    email:     row.email,
    role:      row.role,
    isActive:  row.isActive,
    notificationPreferences: row.notificationPreferences,
    createdAt: row.createdAt,
  }
}

/**
 * List all users, alphabetical. Returns projection WITHOUT `passwordHash`.
 */
export async function listUsers(): Promise<UserProjection[]> {
  const rows = await db.select().from(users).orderBy(asc(users.name))
  return rows.map(project)
}

/**
 * Get a single user by id (without passwordHash). Returns null if not found.
 */
export async function getUserById(id: string): Promise<UserProjection | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return row ? project(row) : null
}

/**
 * Create a new user. Hashes password with bcrypt(10) BEFORE insert.
 *
 * Throws Postgres unique-violation (code '23505') on duplicate email so the
 * plugin layer can map to HTTP 409. The thrown error preserves the original
 * `code` property exposed by postgres-js.
 */
export async function createUser(input: {
  name:     string
  email:    string
  role:     Role
  password: string
}): Promise<UserProjection> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST)
  const [row] = await db
    .insert(users)
    .values({
      name:         input.name,
      email:        input.email,
      role:         input.role,
      passwordHash,
    })
    .returning()
  return project(row!)
}

/**
 * Patch role / isActive / notificationPreferences. Returns null if not found.
 * Never updates passwordHash here — that is a dedicated separate endpoint
 * (out of scope for this plan, see D-18 follow-up).
 */
export async function updateUser(
  id: string,
  patch: {
    role?:     Role
    isActive?: boolean
    notificationPreferences?: NotificationPreferences
  },
): Promise<UserProjection | null> {
  const updates: Record<string, unknown> = {}
  if (patch.role !== undefined)     updates.role     = patch.role
  if (patch.isActive !== undefined) updates.isActive = patch.isActive
  if (patch.notificationPreferences !== undefined) {
    updates.notificationPreferences = patch.notificationPreferences
  }

  if (Object.keys(updates).length === 0) {
    // Nothing to update — return current row to keep the API idempotent.
    return getUserById(id)
  }

  const [row] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, id))
    .returning()
  return row ? project(row) : null
}

/**
 * SOFT DELETE per CONTEXT D-18 — sets isActive=false. Authentication code
 * (`validateCredentials` in auth.service.ts) already rejects login for users
 * with isActive=false, effectively disabling the account while preserving
 * audit trail (assigned alerts, treatments, etc.).
 */
export async function deactivateUser(id: string): Promise<UserProjection | null> {
  const [row] = await db
    .update(users)
    .set({ isActive: false })
    .where(eq(users.id, id))
    .returning()
  return row ? project(row) : null
}

/**
 * Self-service: any authenticated user updates THEIR OWN notification prefs.
 * Merges with existing prefs (partial update — sending only `critico` keeps
 * `medio`/`baixo` untouched).
 *
 * SECURITY:
 *  - Caller must pass user.id derived from the JWT, NEVER from the request
 *    body (enforced by the plugin layer via authGuard `derive`).
 *  - Validation of the prefs shape happens at the plugin TypeBox layer.
 */
export async function updateMyNotificationPreferences(
  userId: string,
  prefs: NotificationPreferences,
): Promise<UserProjection | null> {
  const current = await getUserById(userId)
  if (!current) return null

  const existing = (current.notificationPreferences ?? {
    critico: true, medio: false, baixo: false,
  }) as NotificationPreferences

  const merged: NotificationPreferences = {
    critico: prefs.critico ?? existing.critico,
    medio:   prefs.medio   ?? existing.medio,
    baixo:   prefs.baixo   ?? existing.baixo,
    seenAt:  existing.seenAt,  // preserva o "lido" do sino ao salvar preferências de severidade
  }

  const [row] = await db
    .update(users)
    .set({ notificationPreferences: merged })
    .where(eq(users.id, userId))
    .returning()
  return row ? project(row) : null
}

/**
 * "Marcar todas como lidas" do sino de notificações. Carimba seenAt = agora
 * (relógio do servidor, nunca do cliente) preservando as preferências de
 * severidade. As não-lidas (ocorrências abertas posteriores a seenAt) zeram.
 */
export async function markMyNotificationsSeen(userId: string): Promise<UserProjection | null> {
  const current = await getUserById(userId)
  if (!current) return null

  const existing = (current.notificationPreferences ?? {
    critico: true, medio: false, baixo: false,
  }) as NotificationPreferences

  const merged: NotificationPreferences = { ...existing, seenAt: new Date().toISOString() }

  const [row] = await db
    .update(users)
    .set({ notificationPreferences: merged })
    .where(eq(users.id, userId))
    .returning()
  return row ? project(row) : null
}
