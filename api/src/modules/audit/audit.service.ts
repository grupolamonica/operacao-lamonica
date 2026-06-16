/**
 * audit.service.ts — feed unificado de auditoria das AÇÕES DOS OPERADORES.
 *
 * Junta, em ordem cronológica, tudo que um operador (usuário da Torre) fez e que
 * fica persistido com autoria + timestamp:
 *   - trip_events (manual)  → notas / reagendamentos / autorização de atraso
 *   - treatments            → tratativas de ocorrência (assumiu, ligou, resolveu…)
 *   - communications        → ligações / SMS / WhatsApp / observações
 *   - op_status_event       → alterações de status operacional (painel SPX)
 *
 * Filtros: período (inicio/fim, via prazoRangeSql — bounds de dia em UTC, igual ao
 * resto do app) e operador (operatorId = users.id). Cada fonte é consultada de
 * forma independente e tolerante a falha (try/catch → []), pra uma tabela ausente
 * (ex.: op_status_event criada via SQL manual) nunca derrubar o feed inteiro.
 *
 * Somente leitura. Endpoint é admin-only (audit.plugin + requireRole).
 */
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { prazoRangeSql } from '../../lib/prazoRange'

export type AuditCategory = 'nota' | 'tratativa' | 'comunicacao' | 'status_operacional'

export interface AuditItem {
  id:           string
  category:     AuditCategory
  action:       string          // rótulo humano pt-BR
  operatorId:   string | null
  operatorName: string
  target:       string | null   // contexto: "Viagem 4502", "LH 4410", "Motorista X"
  detail:       string | null   // nota / conteúdo / → status
  occurredAt:   string          // ISO 8601
  severity:     string | null   // só tratativas (do alerta)
  // Refs p/ o deep-link (clicar no log → abre a entidade na tela certa).
  alertId:      string | null
  tripId:       string | null
  driverId:     string | null
  lh:           string | null
}

export interface AuditFilters {
  inicio?:     string | null
  fim?:        string | null
  operatorId?: string | null
  category?:   AuditCategory | null
}

const PER_SOURCE_LIMIT = 1000
const TOTAL_LIMIT       = 1000

const NOTE_ACTION: Record<string, string> = {
  manual_note:        'Adicionou uma nota',
  reagendamento:      'Reagendou a viagem',
  autorizacao_atraso: 'Autorizou atraso',
}
const TREATMENT_ACTION: Record<string, string> = {
  assumiu:             'Assumiu a ocorrência',
  registrou_tratativa: 'Registrou tratativa',
  ligou_motorista:     'Ligou para o motorista',
  escalou:             'Escalou a ocorrência',
  resolveu:            'Resolveu a ocorrência',
  painel_obs:          'Observação no painel',
  comment:             'Comentou na ocorrência',
}
// status codes → rótulo pt-BR (p/ as transições "transition:x_to_y").
const STATUS_PT: Record<string, string> = {
  aberto: 'Aberta', em_analise: 'Em análise', em_tratativa: 'Em tratativa',
  resolvido: 'Resolvida', encerrado: 'Encerrada',
}
function treatmentAction(t: string): string {
  if (TREATMENT_ACTION[t]) return TREATMENT_ACTION[t]
  if (t.startsWith('transition:')) {
    const to = t.slice('transition:'.length).split('_to_')[1]
    return to ? `Mudou status p/ ${STATUS_PT[to] ?? to}` : 'Mudou status da ocorrência'
  }
  return t ? `Tratou ocorrência (${t})` : 'Tratou ocorrência'
}
const COMM_ACTION: Record<string, string> = {
  call:     'Ligou para o motorista',
  sms:      'Enviou SMS',
  whatsapp: 'Enviou WhatsApp',
  note:     'Registrou observação',
}
const COMM_OUTCOME: Record<string, string> = {
  atendida: 'atendida', nao_atendida: 'não atendida', caixa_postal: 'caixa postal',
  enviada: 'enviada', recebida: 'recebida',
}

const toIso = (v: unknown): string => {
  const d = new Date(v as string | number | Date)
  return isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString()
}
const clean = (s: unknown): string | null => {
  const v = (s == null ? '' : String(s)).trim()
  return v || null
}

type Row = Record<string, unknown>

async function fromTripEvents(f: AuditFilters): Promise<AuditItem[]> {
  const opCond = f.operatorId ? sql`AND te.created_by = ${f.operatorId}::uuid` : sql``
  const rows = (await db.execute(sql`
    SELECT te.id::text AS id, te.event_type, te.notes, te.occurred_at,
           te.created_by::text AS operator_id, u.name AS operator_name,
           t.code AS trip_code, te.trip_id::text AS trip_id
    FROM trip_events te
    JOIN users u ON u.id = te.created_by
    LEFT JOIN trips t ON t.id = te.trip_id
    -- só notas/ações manuais reais do operador; os eventos alert_* são espelho do
    -- workflow de ocorrência (já cobertos por treatments) — evita duplicar no feed.
    WHERE te.created_by IS NOT NULL
      AND te.event_type IN ('manual_note', 'reagendamento', 'autorizacao_atraso')
      AND ${prazoRangeSql(sql`te.occurred_at`, f.inicio, f.fim)}
      ${opCond}
    ORDER BY te.occurred_at DESC
    LIMIT ${PER_SOURCE_LIMIT}
  `)) as unknown as Row[]
  return rows.map((r) => ({
    id:           `nota:${r.id}`,
    category:     'nota' as const,
    action:       NOTE_ACTION[String(r.event_type)] ?? 'Registrou evento manual',
    operatorId:   clean(r.operator_id),
    operatorName: clean(r.operator_name) ?? '—',
    target:       r.trip_code ? `Viagem ${r.trip_code}` : null,
    detail:       clean(r.notes),
    occurredAt:   toIso(r.occurred_at),
    severity:     null,
    alertId:      null,
    tripId:       clean(r.trip_id),
    driverId:     null,
    lh:           null,
  }))
}

async function fromTreatments(f: AuditFilters): Promise<AuditItem[]> {
  const opCond = f.operatorId ? sql`AND tr.operator_id = ${f.operatorId}::uuid` : sql``
  const rows = (await db.execute(sql`
    SELECT tr.id::text AS id, tr.action_type, tr.notes, tr.outcome, tr.created_at,
           tr.operator_id::text AS operator_id, COALESCE(u.name, tr.author_name) AS operator_name,
           a.title AS alert_title, a.severity, t.code AS trip_code,
           tr.alert_id::text AS alert_id, tr.trip_id::text AS trip_id
    FROM treatments tr
    LEFT JOIN users u ON u.id = tr.operator_id
    LEFT JOIN alerts a ON a.id = tr.alert_id
    LEFT JOIN trips t ON t.id = tr.trip_id
    -- só ações de gente: usuário da Torre (operator_id) OU operador nomeado do painel;
    -- exclui o ator automático "SISTEMA" (sync), que não é um operador.
    WHERE (tr.operator_id IS NOT NULL OR (tr.author_name IS NOT NULL AND upper(tr.author_name) <> 'SISTEMA'))
      AND ${prazoRangeSql(sql`tr.created_at`, f.inicio, f.fim)}
      ${opCond}
    ORDER BY tr.created_at DESC
    LIMIT ${PER_SOURCE_LIMIT}
  `)) as unknown as Row[]
  return rows.map((r) => ({
    id:           `tratativa:${r.id}`,
    category:     'tratativa' as const,
    action:       treatmentAction(String(r.action_type ?? '')),
    operatorId:   clean(r.operator_id),
    operatorName: clean(r.operator_name) ?? '—',
    target:       clean(r.alert_title) ?? (r.trip_code ? `Viagem ${r.trip_code}` : null),
    detail:       clean(r.notes),
    occurredAt:   toIso(r.created_at),
    severity:     clean(r.severity),
    alertId:      clean(r.alert_id),
    tripId:       clean(r.trip_id),
    driverId:     null,
    lh:           null,
  }))
}

async function fromCommunications(f: AuditFilters): Promise<AuditItem[]> {
  const opCond = f.operatorId ? sql`AND c.operator_id = ${f.operatorId}::uuid` : sql``
  const rows = (await db.execute(sql`
    SELECT c.id::text AS id, c.channel, c.direction, c.outcome, c.content, c.occurred_at,
           c.operator_id::text AS operator_id, u.name AS operator_name,
           d.name AS driver_name, t.code AS trip_code,
           c.alert_id::text AS alert_id, c.trip_id::text AS trip_id, c.driver_id::text AS driver_id
    FROM communications c
    JOIN users u ON u.id = c.operator_id
    LEFT JOIN drivers d ON d.id = c.driver_id
    LEFT JOIN trips t ON t.id = c.trip_id
    WHERE c.operator_id IS NOT NULL
      AND ${prazoRangeSql(sql`c.occurred_at`, f.inicio, f.fim)}
      ${opCond}
    ORDER BY c.occurred_at DESC
    LIMIT ${PER_SOURCE_LIMIT}
  `)) as unknown as Row[]
  return rows.map((r) => {
    const outcome = COMM_OUTCOME[String(r.outcome)] ?? clean(r.outcome)
    const content = clean(r.content)
    return {
      id:           `comunicacao:${r.id}`,
      category:     'comunicacao' as const,
      action:       COMM_ACTION[String(r.channel)] ?? 'Comunicação',
      operatorId:   clean(r.operator_id),
      operatorName: clean(r.operator_name) ?? '—',
      target:       r.driver_name ? `Motorista ${r.driver_name}` : (r.trip_code ? `Viagem ${r.trip_code}` : null),
      detail:       [content, outcome ? `(${outcome})` : null].filter(Boolean).join(' ') || null,
      occurredAt:   toIso(r.occurred_at),
      severity:     null,
      alertId:      clean(r.alert_id),
      tripId:       clean(r.trip_id),
      driverId:     clean(r.driver_id),
      lh:           null,
    }
  })
}

async function fromOpStatus(f: AuditFilters, operatorName: string | null): Promise<AuditItem[]> {
  // op_status_event.operador é o NOME do operador (resolveOperador). Quando filtra
  // por operador (id), casa pelo nome resolvido; id sem nome → não casa nada.
  const opCond = f.operatorId
    ? (operatorName ? sql`AND e.operador = ${operatorName}` : sql`AND FALSE`)
    : sql``
  const rows = (await db.execute(sql`
    SELECT e.lh, e.status_operacional, e.operador, e.created_at
    FROM op_status_event e
    -- exclui o ator automático "SISTEMA": só mudanças de status feitas por operador.
    WHERE e.operador IS NOT NULL AND upper(e.operador) <> 'SISTEMA'
      AND ${prazoRangeSql(sql`e.created_at`, f.inicio, f.fim)}
      ${opCond}
    ORDER BY e.created_at DESC
    LIMIT ${PER_SOURCE_LIMIT}
  `)) as unknown as Row[]
  return rows.map((r) => ({
    id:           `status:${r.lh}:${toIso(r.created_at)}`,
    category:     'status_operacional' as const,
    action:       'Alterou o status operacional',
    operatorId:   null,
    operatorName: clean(r.operador) ?? '—',
    target:       r.lh ? `LH ${r.lh}` : null,
    detail:       clean(r.status_operacional) ? `→ ${r.status_operacional}` : null,
    occurredAt:   toIso(r.created_at),
    severity:     null,
    alertId:      null,
    tripId:       null,
    driverId:     null,
    lh:           clean(r.lh),
  }))
}

/**
 * Feed unificado das ações dos operadores, mais recente primeiro.
 * Cada fonte é isolada por try/catch — uma tabela ausente vira [] (feed segue).
 */
export async function getOperatorAudit(f: AuditFilters): Promise<AuditItem[]> {
  // Resolve nome do operador (p/ casar op_status_event que é keyed por nome).
  let operatorName: string | null = null
  if (f.operatorId) {
    try {
      const [u] = (await db.execute(
        sql`SELECT name FROM users WHERE id = ${f.operatorId}::uuid LIMIT 1`,
      )) as unknown as Row[]
      operatorName = clean(u?.name)
    } catch { /* segue sem nome */ }
  }

  const want = (c: AuditCategory) => !f.category || f.category === c
  const safe = async (on: boolean, fn: () => Promise<AuditItem[]>) => {
    if (!on) return []
    try { return await fn() } catch { return [] }
  }

  const groups = await Promise.all([
    safe(want('nota'),                () => fromTripEvents(f)),
    safe(want('tratativa'),           () => fromTreatments(f)),
    safe(want('comunicacao'),         () => fromCommunications(f)),
    safe(want('status_operacional'),  () => fromOpStatus(f, operatorName)),
  ])

  return groups
    .flat()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, TOTAL_LIMIT)
}
