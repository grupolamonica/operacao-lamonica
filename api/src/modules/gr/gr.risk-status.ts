/**
 * Núcleo PURO do Gerenciamento de Risco (GR) — portado do cargas (risk-status.js).
 *
 * Classifica vigências, consolida o veredito do conjunto (Angellira + BRK + SPX)
 * por entidade e deriva a lista de alertas. Sem I/O — recebe dados já normalizados
 * e é 100% testável. Semáforo EXPIRED / EXPIRING_SOON (≤30d) / OK — o limiar de 30d
 * já coincide com o Torre (documentosVencendo, drivers.service).
 */

const DAY_MS = 86_400_000

export const EXPIRY_WARN_DAYS = 30

export type AlertLevel = 'OK' | 'EXPIRING_SOON' | 'EXPIRED'
export type Verdict = 'OK' | 'ATENCAO' | 'CRITICO' | 'SEM_DADO'
export type Severity = 'crit' | 'warn'
export type AlertType = 'EXPIRY' | 'STATE'
export type Source = 'ANGELLIRA' | 'BRK' | 'SPX'

type SrcSeverity = 'ok' | 'atencao' | 'critico' | 'sem_dado'

export interface AngelliraInput {
  status?: string | null
  statusText?: string | null
  validUntil?: string | null
  daysUntilExpiry?: number | null
  alertLevel?: AlertLevel | null
  checkedAt?: string | null
}
export interface BrkInput extends AngelliraInput {
  conjuntoApto?: boolean | null
}
export interface SpxInput {
  status?: string | null
  statusText?: string | null
  encontrado?: boolean | null
  checkedAt?: string | null
}

export interface DriverRiskInput {
  entityId: string
  displayName?: string | null
  document?: string | null
  angellira?: AngelliraInput | null
  brk?: BrkInput | null
  spx?: SpxInput | null
}

export interface VehicleRiskInput {
  entityId: string
  plate?: string | null
  plateRole?: string | null
  linkedDriver?: { name: string | null; cpf: string | null } | null
  angellira?: AngelliraInput | null
}

export interface GrAlert {
  id: string
  entityType: 'motorista' | 'veiculo'
  entityId: string
  displayName: string | null
  document: string | null
  plate: string | null
  plateRole: string | null
  linkedDriver: { name: string | null; cpf: string | null } | null
  source: Source
  alertType: AlertType
  severity: Severity
  daysUntilExpiry: number | null
  dueDate: string | null
  message: string
  checkedAt: string | null
}

function norm(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function toUtcMidnight(value: string | Date | null | undefined): number | null {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Classifica uma data de validade em nível de alerta + dias restantes. */
export function classifyExpiry(
  validUntil: string | Date | null | undefined,
  opts: { nowMs?: number; warnDays?: number } = {},
): { daysUntilExpiry: number | null; alertLevel: AlertLevel | null } {
  const { nowMs = Date.now(), warnDays = EXPIRY_WARN_DAYS } = opts
  const expMid = toUtcMidnight(validUntil)
  if (expMid == null) return { daysUntilExpiry: null, alertLevel: null }
  const nowMid = toUtcMidnight(new Date(nowMs))!
  const daysUntilExpiry = Math.round((expMid - nowMid) / DAY_MS)
  const alertLevel: AlertLevel = daysUntilExpiry < 0 ? 'EXPIRED' : daysUntilExpiry <= warnDays ? 'EXPIRING_SOON' : 'OK'
  return { daysUntilExpiry, alertLevel }
}

const ANGELLIRA_BAD = new Set([
  'not_found', 'nao_encontrado', 'nao encontrado', 'nao_conforme', 'nao conforme', 'reprovado', 'invalid', 'vencido',
])

function classifyAngellira(a?: AngelliraInput | null): SrcSeverity {
  if (!a) return 'sem_dado'
  if (a.alertLevel === 'EXPIRED') return 'critico'
  if (a.alertLevel === 'EXPIRING_SOON') return 'atencao'
  if (a.alertLevel === 'OK') return 'ok'
  const s = norm(a.status)
  if (!s) return 'sem_dado'
  if (ANGELLIRA_BAD.has(s)) return 'critico'
  if (s === 'found' || s === 'conforme' || s === 'vigente') return 'ok'
  return 'sem_dado'
}

function classifyBrk(b?: BrkInput | null): SrcSeverity {
  if (!b) return 'sem_dado'
  if (b.conjuntoApto === false) return 'critico'
  if (b.alertLevel === 'EXPIRED') return 'critico'
  if (b.alertLevel === 'EXPIRING_SOON') return 'atencao'
  if (b.alertLevel === 'OK') return 'ok'
  if (b.conjuntoApto === true) return 'ok'
  const s = norm(b.status)
  if (!s || s === 'erro') return 'sem_dado'
  if (s === 'vigente' || s === 'apto') return 'ok'
  if (s === 'reprovado' || s === 'vencido' || s === 'nao_apto') return 'critico'
  return 'sem_dado'
}

const SPX_OK = new Set(['ativo', 'active', 'found', 'vigente', 'nossa', 'ja_e_nossa', 'ja e nossa', 'cadastrado'])
const SPX_WARN = new Set(['pendente', 'pending', 'em_analise', 'em analise', 'outra_agencia', 'outra agencia'])
const SPX_CRIT = new Set([
  'inativo', 'inactive', 'bloqueado', 'blocked', 'nao_cadastrado', 'nao cadastrado', 'not_found', 'nao_encontrado', 'reprovado', 'suspenso',
])

function classifySpx(s?: SpxInput | null): SrcSeverity {
  if (!s) return 'sem_dado'
  const st = norm(s.status)
  if (st) {
    if (SPX_OK.has(st)) return 'ok'
    if (SPX_WARN.has(st)) return 'atencao'
    if (SPX_CRIT.has(st)) return 'critico'
  }
  if (s.encontrado === true && !st) return 'ok'
  return 'sem_dado'
}

/** Consolida o veredito do conjunto a partir das três fontes. Pior severidade vence. */
export function consolidateVerdict(
  input: { angellira?: AngelliraInput | null; brk?: BrkInput | null; spx?: SpxInput | null } = {},
): { status: Verdict; reasons: Source[] } {
  const parts: { source: Source; sev: SrcSeverity }[] = [
    { source: 'ANGELLIRA', sev: classifyAngellira(input.angellira) },
    { source: 'BRK', sev: classifyBrk(input.brk) },
    { source: 'SPX', sev: classifySpx(input.spx) },
  ]
  const present = parts.filter((p) => p.sev !== 'sem_dado')
  if (present.length === 0) return { status: 'SEM_DADO', reasons: [] }
  const crit = present.filter((p) => p.sev === 'critico').map((p) => p.source)
  const warn = present.filter((p) => p.sev === 'atencao').map((p) => p.source)
  if (crit.length) return { status: 'CRITICO', reasons: crit }
  if (warn.length) return { status: 'ATENCAO', reasons: warn }
  return { status: 'OK', reasons: [] }
}

function expiryMessage(sourceLabel: string, alertLevel: AlertLevel, days: number | null | undefined): string {
  const n = typeof days === 'number' ? days : 0
  return alertLevel === 'EXPIRED' ? `${sourceLabel} vencido há ${Math.abs(n)}d` : `${sourceLabel} vence em ${n}d`
}

function withId(a: Omit<GrAlert, 'id'>): GrAlert {
  return { ...a, id: `${a.entityType}:${a.entityId}:${a.source}:${a.alertType}` }
}

/** Deriva os alertas de um motorista já normalizado. */
export function deriveDriverAlerts(d?: DriverRiskInput | null): GrAlert[] {
  if (!d) return []
  const base = {
    entityType: 'motorista' as const,
    entityId: d.entityId,
    displayName: d.displayName ?? null,
    document: d.document ?? null,
    plate: null,
    plateRole: null,
    linkedDriver: null,
  }
  const alerts: Omit<GrAlert, 'id'>[] = []

  const a = d.angellira
  if (a) {
    if (a.alertLevel === 'EXPIRED' || a.alertLevel === 'EXPIRING_SOON') {
      alerts.push({
        ...base, source: 'ANGELLIRA', alertType: 'EXPIRY',
        severity: a.alertLevel === 'EXPIRED' ? 'crit' : 'warn',
        daysUntilExpiry: a.daysUntilExpiry ?? null, dueDate: a.validUntil ?? null,
        message: expiryMessage('Angellira', a.alertLevel, a.daysUntilExpiry), checkedAt: a.checkedAt ?? null,
      })
    } else if (classifyAngellira(a) === 'critico') {
      alerts.push({
        ...base, source: 'ANGELLIRA', alertType: 'STATE', severity: 'crit',
        daysUntilExpiry: null, dueDate: null, message: 'Angellira não conforme', checkedAt: a.checkedAt ?? null,
      })
    }
  }

  const b = d.brk
  if (b) {
    if (b.conjuntoApto === false) {
      alerts.push({
        ...base, source: 'BRK', alertType: 'STATE', severity: 'crit',
        daysUntilExpiry: null, dueDate: null, message: 'Conjunto BRK reprovado', checkedAt: b.checkedAt ?? null,
      })
    } else if (b.alertLevel === 'EXPIRED' || b.alertLevel === 'EXPIRING_SOON') {
      alerts.push({
        ...base, source: 'BRK', alertType: 'EXPIRY',
        severity: b.alertLevel === 'EXPIRED' ? 'crit' : 'warn',
        daysUntilExpiry: b.daysUntilExpiry ?? null, dueDate: b.validUntil ?? null,
        message: expiryMessage('BRK', b.alertLevel, b.daysUntilExpiry), checkedAt: b.checkedAt ?? null,
      })
    }
  }

  const spxSev = classifySpx(d.spx)
  if (spxSev === 'critico' || spxSev === 'atencao') {
    const label = (d.spx && (d.spx.statusText || d.spx.status)) || 'situação irregular'
    alerts.push({
      ...base, source: 'SPX', alertType: 'STATE',
      severity: spxSev === 'critico' ? 'crit' : 'warn',
      daysUntilExpiry: null, dueDate: null, message: `SPX: ${label}`, checkedAt: (d.spx && d.spx.checkedAt) ?? null,
    })
  }

  return alerts.map(withId)
}

/** Deriva os alertas de um veículo já normalizado (só Angellira hoje). */
export function deriveVehicleAlerts(v?: VehicleRiskInput | null): GrAlert[] {
  if (!v) return []
  const a = v.angellira
  if (!a || (a.alertLevel !== 'EXPIRED' && a.alertLevel !== 'EXPIRING_SOON')) return []
  return [withId({
    entityType: 'veiculo',
    entityId: v.entityId,
    displayName: v.plate ?? null,
    document: null,
    plate: v.plate ?? null,
    plateRole: v.plateRole ?? null,
    linkedDriver: v.linkedDriver ?? null,
    source: 'ANGELLIRA',
    alertType: 'EXPIRY',
    severity: a.alertLevel === 'EXPIRED' ? 'crit' : 'warn',
    daysUntilExpiry: a.daysUntilExpiry ?? null,
    dueDate: a.validUntil ?? null,
    message: expiryMessage('Angellira', a.alertLevel, a.daysUntilExpiry),
    checkedAt: a.checkedAt ?? null,
  })]
}

const SEV_RANK: Record<Severity, number> = { crit: 0, warn: 1 }

function orderValue(a: GrAlert): number {
  if (a.alertType === 'STATE') return -1e9
  return typeof a.daysUntilExpiry === 'number' ? a.daysUntilExpiry : 1e9
}

/** Ordena por urgência: crítico antes de atenção; estado antes de vencimento; vencimento crescente. */
export function sortByUrgency(alerts: GrAlert[]): GrAlert[] {
  return [...alerts].sort((x, y) => {
    const sr = (SEV_RANK[x.severity] ?? 9) - (SEV_RANK[y.severity] ?? 9)
    if (sr !== 0) return sr
    const ov = orderValue(x) - orderValue(y)
    if (ov !== 0) return ov
    return String(x.id).localeCompare(String(y.id))
  })
}
