// Pure delivery risk engine.
// Inputs: snapshot of a trip + small operational context (no DB / IO).
// Output: 0–100 score, qualitative level, and per-factor breakdown so the UI
// can explain WHY a trip is risky — not just give a number.
//
// Design principle: each factor contributes a non-negative score that is
// capped, then we clamp the sum to 100. Adding a new factor cannot retroactively
// lower the score of trips computed before it (monotonic safety).

export type RiskLevel = 'baixo' | 'medio' | 'alto' | 'critico'

export interface RiskFactor {
  key:          string
  label:        string
  weight:       number    // max contribution this factor can add
  contribution: number    // actual points contributed [0..weight]
  detail?:      string    // short human-readable explanation
}

export interface RiskResult {
  score:   number          // 0–100
  level:   RiskLevel
  factors: RiskFactor[]
}

export interface RiskInput {
  // Trip snapshot (only the fields we read)
  windowEnd:       Date | null
  eta:             Date | null
  status:          string
  progressPct:     number     // 0–100
  distanceTotal:   number | null  // km
  distanceDone:    number | null  // km
  departedAt:      Date | null
  // Operational context
  now:             Date
  lastUpdateAt:    Date | null   // last GPS ping (null = never reported)
  openAlertCount:  number        // alerts with status in (aberto|em_analise|em_tratativa)
  criticalAlertCount: number     // subset of above with severity=critico
  stoppedSinceMin: number | null // minutes since the vehicle stopped, null if moving
}

const LEVEL_THRESHOLDS: Array<[number, RiskLevel]> = [
  [76, 'critico'],
  [51, 'alto'   ],
  [26, 'medio'  ],
  [0,  'baixo'  ],
]

export function scoreToLevel(score: number): RiskLevel {
  for (const [floor, level] of LEVEL_THRESHOLDS) if (score >= floor) return level
  return 'baixo'
}

// --- Factor scorers ---------------------------------------------------------
// All return [0..weight].

function etaPressure(input: RiskInput): RiskFactor {
  const weight = 40
  if (!input.windowEnd || !input.eta) {
    return { key: 'eta', label: 'ETA vs janela', weight, contribution: 0, detail: 'Sem ETA/janela' }
  }
  const delayMin = Math.round((input.eta.getTime() - input.windowEnd.getTime()) / 60_000)
  // 0 min late → 0, 15 min → 10, 30 min → 20, 60 min → 35, 120+ min → 40
  let c = 0
  if      (delayMin <= 0)   c = 0
  else if (delayMin <= 15)  c = (delayMin / 15) * 10
  else if (delayMin <= 30)  c = 10 + ((delayMin - 15) / 15) * 10
  else if (delayMin <= 60)  c = 20 + ((delayMin - 30) / 30) * 15
  else if (delayMin <= 120) c = 35 + ((delayMin - 60) / 60) * 5
  else                      c = weight
  const detail = delayMin <= 0 ? 'No prazo' : `+${delayMin}min de atraso previsto`
  return { key: 'eta', label: 'ETA vs janela', weight, contribution: Math.min(weight, Math.round(c)), detail }
}

function signal(input: RiskInput): RiskFactor {
  const weight = 30
  if (!input.lastUpdateAt) {
    return { key: 'signal', label: 'Sinal GPS', weight, contribution: weight, detail: 'Nunca reportou posição' }
  }
  const ageMin = (input.now.getTime() - input.lastUpdateAt.getTime()) / 60_000
  // 0–5 min: 0; 5–15: linear 0→10; 15–30: 10→20; 30+: 20→30; >60: max
  let c = 0
  if      (ageMin <= 5)   c = 0
  else if (ageMin <= 15)  c = ((ageMin - 5)  / 10) * 10
  else if (ageMin <= 30)  c = 10 + ((ageMin - 15) / 15) * 10
  else if (ageMin <= 60)  c = 20 + ((ageMin - 30) / 30) * 10
  else                    c = weight
  const detail = ageMin <= 5 ? 'Sinal ativo' : `Último ping há ${Math.round(ageMin)}min`
  return { key: 'signal', label: 'Sinal GPS', weight, contribution: Math.min(weight, Math.round(c)), detail }
}

function activeAlerts(input: RiskInput): RiskFactor {
  const weight = 20
  // Critical alerts weigh 7 each (capped at 14), other open alerts weigh 2 each (capped at 6)
  const critContribution  = Math.min(14, input.criticalAlertCount * 7)
  const otherCount        = Math.max(0, input.openAlertCount - input.criticalAlertCount)
  const otherContribution = Math.min(6, otherCount * 2)
  const c = Math.min(weight, critContribution + otherContribution)
  let detail = 'Sem ocorrências abertas'
  if (input.openAlertCount > 0) {
    detail = `${input.openAlertCount} aberta(s)` + (input.criticalAlertCount > 0 ? `, ${input.criticalAlertCount} crítica(s)` : '')
  }
  return { key: 'alerts', label: 'Ocorrências abertas', weight, contribution: c, detail }
}

function progressVsTime(input: RiskInput): RiskFactor {
  const weight = 10
  // Compare progress% against time-used% relative to the original window.
  // Only meaningful for in_progress / delayed trips with a departedAt and window.
  if (input.status !== 'in_progress' && input.status !== 'delayed') {
    return { key: 'pace', label: 'Ritmo vs janela', weight, contribution: 0, detail: 'N/A' }
  }
  if (!input.departedAt || !input.windowEnd) {
    return { key: 'pace', label: 'Ritmo vs janela', weight, contribution: 0, detail: 'Sem janela' }
  }
  const totalMs = input.windowEnd.getTime() - input.departedAt.getTime()
  if (totalMs <= 0) {
    return { key: 'pace', label: 'Ritmo vs janela', weight, contribution: 0, detail: 'Janela inválida' }
  }
  const elapsedPct = Math.min(100, Math.max(0, ((input.now.getTime() - input.departedAt.getTime()) / totalMs) * 100))
  const gap = elapsedPct - (input.progressPct ?? 0) // positive ⇒ behind schedule
  let c = 0
  if      (gap <= 5)   c = 0
  else if (gap <= 15)  c = (gap - 5) / 10 * 5
  else if (gap <= 30)  c = 5 + (gap - 15) / 15 * 5
  else                 c = weight
  const detail = gap <= 5
    ? 'No ritmo'
    : `${Math.round(gap)} p.p. atrás do esperado`
  return { key: 'pace', label: 'Ritmo vs janela', weight, contribution: Math.min(weight, Math.round(c)), detail }
}

// --- Main entry point -------------------------------------------------------

export function calculateDeliveryRisk(input: RiskInput): RiskResult {
  // Terminal trips carry no risk
  if (input.status === 'completed' || input.status === 'cancelled') {
    return { score: 0, level: 'baixo', factors: [] }
  }

  const factors = [
    etaPressure(input),
    signal(input),
    activeAlerts(input),
    progressVsTime(input),
  ]
  const score = Math.min(100, factors.reduce((sum, f) => sum + f.contribution, 0))
  return { score, level: scoreToLevel(score), factors }
}
