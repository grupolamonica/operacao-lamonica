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

/** Tickets ATIVOS (em análise/em tratativa) que um operador está tratando — p/ a fila de operadores. */
export async function getOperatorTickets(userId: string) {
  const rows = (await db.execute(sql`
    SELECT a.id, a.type, a.severity, a.status, a.title, a.occurred_at,
           t.sheet_lh AS lh, t.sheet_motorista AS motorista, c.name AS cliente
    FROM alerts a
    LEFT JOIN trips t   ON t.id = a.trip_id
    LEFT JOIN clients c ON c.id = t.client_id
    WHERE a.assigned_to = ${userId} AND a.status IN ('em_analise','em_tratativa')
    ORDER BY a.occurred_at DESC
    LIMIT 100
  `)) as unknown as any[]
  return rows.map((r) => ({
    id: r.id, type: r.type, severity: r.severity, status: r.status, title: r.title,
    occurredAt: r.occurred_at, lh: r.lh ?? '', motorista: r.motorista ?? '', cliente: r.cliente ?? '',
  }))
}
