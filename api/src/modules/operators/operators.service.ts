import { sql } from 'drizzle-orm'
import { db } from '../../db/client'

/**
 * Presença de operadores (Phase 12) — porte da "Fila de Operadores" do painel GAS,
 * mas com presença REAL (heartbeat) em vez de lista estática.
 * O frontend pinga /heartbeat a cada ~30s; um operador é "online" se seu
 * last_seen_at estiver dentro da janela (default 90s).
 */
const ONLINE_WINDOW_SECONDS = 90

export async function heartbeat(userId: string) {
  await db.execute(sql`UPDATE public.users SET last_seen_at = now() WHERE id = ${userId}`)
  return { ok: true, at: new Date().toISOString() }
}

export async function listOnlineOperators(windowSeconds = ONLINE_WINDOW_SECONDS) {
  const rows = (await db.execute(sql`
    SELECT u.id, u.name, u.role, u.last_seen_at,
           (SELECT count(*)::int FROM alerts a
             WHERE a.assigned_to = u.id
               AND a.status IN ('em_analise','em_tratativa')) AS tickets_ativos
    FROM public.users u
    WHERE u.is_active = true
      AND u.last_seen_at IS NOT NULL
      AND u.last_seen_at > now() - make_interval(secs => ${windowSeconds})
    ORDER BY u.name
  `)) as unknown as any[]

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    lastSeenAt: r.last_seen_at,
    ticketsAtivos: Number(r.tickets_ativos ?? 0),
  }))
}
