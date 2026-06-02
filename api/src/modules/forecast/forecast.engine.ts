// Pure statistical forecast primitives. No IO, no DB, no time-of-day dependency.
// Tests should pass deterministic arrays in and check exact outputs.

export interface SeriesPoint {
  date:  string   // ISO date YYYY-MM-DD (used only for ordering / output)
  value: number
}

export interface ForecastPoint extends SeriesPoint {
  forecast: true
  /** 1 standard-deviation lower bound (rough confidence). */
  lower:   number
  /** 1 standard-deviation upper bound. */
  upper:   number
}

/** Simple moving average over the last `window` points. */
export function movingAverage(values: number[], window: number): number {
  if (values.length === 0 || window <= 0) return 0
  const slice = values.slice(-window)
  return slice.reduce((s, x) => s + x, 0) / slice.length
}

/** Ordinary least squares — returns {slope, intercept} fit to y = a + b·x where x is index. */
export function linearTrend(values: number[]): { slope: number; intercept: number } {
  const n = values.length
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 }
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX  += i
    sumY  += values[i]!
    sumXY += i * values[i]!
    sumX2 += i * i
  }
  const denom = n * sumX2 - sumX * sumX
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

/** Sample standard deviation of residuals against a linear fit. */
function stdDevResiduals(values: number[]): number {
  if (values.length < 2) return 0
  const { slope, intercept } = linearTrend(values)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    const yhat = intercept + slope * i
    sum += (values[i]! - yhat) ** 2
  }
  return Math.sqrt(sum / (values.length - 1))
}

/** Weekly seasonal multiplier (mean of day-of-week ratios over the input). */
function seasonalIndex(points: SeriesPoint[]): number[] {
  const byDow: number[][] = Array.from({ length: 7 }, () => [])
  const overall = points.reduce((s, p) => s + p.value, 0) / Math.max(1, points.length)
  if (overall === 0) return Array(7).fill(1)
  for (const p of points) {
    const dow = new Date(p.date + 'T00:00:00Z').getUTCDay()
    byDow[dow]!.push(p.value)
  }
  return byDow.map((arr) => {
    if (arr.length === 0) return 1
    const avg = arr.reduce((s, x) => s + x, 0) / arr.length
    return avg / overall
  })
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().substring(0, 10)
}

/**
 * Project `horizon` days forward from a history series. Uses linear trend +
 * weekly seasonal multiplier, with std-deviation bands as a rough confidence.
 */
export function projectSeries(history: SeriesPoint[], horizon: number): ForecastPoint[] {
  if (history.length === 0 || horizon <= 0) return []
  const values = history.map((p) => p.value)
  const { slope, intercept } = linearTrend(values)
  const sd = stdDevResiduals(values)
  const season = seasonalIndex(history)

  const lastDate = history[history.length - 1]!.date
  const baseIdx  = values.length - 1
  const out: ForecastPoint[] = []
  for (let h = 1; h <= horizon; h++) {
    const idx = baseIdx + h
    const trend = intercept + slope * idx
    const date  = addDaysIso(lastDate, h)
    const dow   = new Date(date + 'T00:00:00Z').getUTCDay()
    const seasonal = season[dow] ?? 1
    const raw = Math.max(0, trend * seasonal)
    out.push({
      date,
      value:    Math.round(raw),
      forecast: true,
      lower:    Math.max(0, Math.round(raw - sd)),
      upper:    Math.round(raw + sd),
    })
  }
  return out
}

/**
 * Holt linear smoothing (level + trend). Useful when the moving average is
 * too lagging. Returns the next n-step forecasts.
 *
 * alpha — level smoothing factor [0..1]; higher = more reactive.
 * beta  — trend smoothing factor [0..1]; higher = more reactive trend.
 */
export function holtForecast(values: number[], steps: number, alpha = 0.4, beta = 0.2): number[] {
  if (values.length === 0) return []
  let level = values[0]!
  let trend = values.length > 1 ? values[1]! - values[0]! : 0
  for (let i = 1; i < values.length; i++) {
    const prevLevel = level
    level = alpha * values[i]! + (1 - alpha) * (level + trend)
    trend = beta * (level - prevLevel) + (1 - beta) * trend
  }
  const out: number[] = []
  for (let h = 1; h <= steps; h++) {
    out.push(Math.max(0, level + h * trend))
  }
  return out
}
