import { format, formatDistance, formatDistanceToNow, differenceInMinutes } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function formatDate(date: Date | string, pattern = 'dd/MM/yyyy HH:mm'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, pattern, { locale: ptBR })
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'HH:mm', { locale: ptBR })
}

// ── Timestamps "wall-clock de Brasília gravados como UTC" (window_end, occurred_at do painel) ──
// Exibe lendo os componentes UTC (= o relógio-de-parede), independente do fuso do navegador.
const BR_OFFSET_MS = 3 * 3_600_000
function utcWall(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Date(d.getTime() + d.getTimezoneOffset() * 60_000)  // desloca p/ o local renderizar os componentes UTC
}

export function formatDateUTC(date: Date | string, pattern = 'dd/MM/yyyy HH:mm'): string {
  return format(utcWall(date), pattern, { locale: ptBR })
}
export function formatTimeUTC(date: Date | string): string {
  return format(utcWall(date), 'HH:mm', { locale: ptBR })
}
/** Relativo ("há 5 min") p/ timestamps wall-clock-as-UTC: compara com o agora de Brasília no mesmo convênio. */
export function formatRelativeWall(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const nowWall = new Date(Date.now() - BR_OFFSET_MS)  // agora de Brasília rotulado UTC
  return formatDistance(d, nowWall, { addSuffix: true, locale: ptBR })
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h${m}min`
}

export function formatRelative(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR })
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

export function formatKm(km: number): string {
  return `${km.toFixed(1)} km`
}

export function minutesBetween(a: Date, b: Date): number {
  return differenceInMinutes(b, a)
}
