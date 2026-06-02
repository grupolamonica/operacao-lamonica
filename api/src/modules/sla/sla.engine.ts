// Pure SLA evaluator. No IO. Given a trip snapshot, the resolved rule, and the
// current time, returns the SLA status + minutes-to-breach + breach reason.
//
// Status semantics:
//   no_prazo  — elapsed% < warning_pct, no fine risk
//   em_risco  — warning_pct ≤ elapsed% ≤ 100% (in the warning band)
//   quebrado  — elapsed% > 100% + grace (window has been exceeded)
//   multa    — elapsed% > 100% + fine_threshold_minutes (contractual fine zone)

export type SlaStatus = 'no_prazo' | 'em_risco' | 'quebrado' | 'multa'

export interface SlaRule {
  id:                   string
  name:                 string
  warningPct:           number   // 50-100 typical
  breachGraceMinutes:   number   // 0-60 typical
  fineThresholdMinutes: number | null
}

export interface SlaInput {
  windowStart:  Date
  windowEnd:    Date
  now:          Date
  /** Optional override: if absent we use (now - windowStart) for elapsed. */
  arrivedAt?:   Date | null
  status?:      string  // trip.status — completed/cancelled short-circuit
}

export interface SlaEvaluation {
  status:          SlaStatus
  ruleId:          string
  ruleName:        string
  warningPct:      number
  elapsedPct:      number             // [0..200] capped
  minutesRemaining: number             // negative if past windowEnd
  /** Set when status ∈ {quebrado, multa}: how many minutes past windowEnd. */
  minutesOverdue:  number
  reason:          string
}

export function evaluateSla(input: SlaInput, rule: SlaRule): SlaEvaluation {
  const totalMs   = input.windowEnd.getTime() - input.windowStart.getTime()
  const elapsedMs = (input.arrivedAt ?? input.now).getTime() - input.windowStart.getTime()
  const elapsedPct = totalMs > 0 ? Math.max(0, Math.min(200, (elapsedMs / totalMs) * 100)) : 0
  const minutesRemaining = Math.round((input.windowEnd.getTime() - input.now.getTime()) / 60_000)
  const minutesOverdue   = Math.max(0, -minutesRemaining)

  let status: SlaStatus = 'no_prazo'
  let reason = 'Dentro da janela'

  // Completed/cancelled freeze the snapshot
  if (input.status === 'completed' || input.status === 'cancelled') {
    if (input.arrivedAt && input.arrivedAt > input.windowEnd) {
      status = 'quebrado'
      reason = `Entregue ${minutesOverdue}min após o fim da janela`
    } else {
      status = 'no_prazo'
      reason = 'Entregue dentro da janela'
    }
  } else if (minutesOverdue > (rule.fineThresholdMinutes ?? Number.POSITIVE_INFINITY)) {
    status = 'multa'
    reason = `+${minutesOverdue}min — zona de multa contratual`
  } else if (minutesOverdue > rule.breachGraceMinutes) {
    status = 'quebrado'
    reason = `+${minutesOverdue}min sem chegada`
  } else if (elapsedPct >= rule.warningPct) {
    status = 'em_risco'
    reason = `Consumiu ${Math.round(elapsedPct)}% da janela (limite: ${rule.warningPct}%)`
  }

  return {
    status,
    ruleId:           rule.id,
    ruleName:         rule.name,
    warningPct:       rule.warningPct,
    elapsedPct:       Math.round(elapsedPct),
    minutesRemaining,
    minutesOverdue,
    reason,
  }
}

/** Pick the most specific active rule for a trip. clientId match beats global default. */
export function resolveRule(trip: { clientId: string | null }, rules: SlaRule[] & Array<SlaRule & { clientId: string | null; active: boolean }>): (SlaRule & { clientId: string | null }) | null {
  const active = rules.filter((r) => r.active !== false)
  const specific = active.find((r) => r.clientId === trip.clientId && trip.clientId != null)
  if (specific) return specific
  const fallback = active.find((r) => r.clientId == null)
  return fallback ?? null
}
