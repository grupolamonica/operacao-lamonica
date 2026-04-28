import { format, formatDistanceToNow, differenceInMinutes } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function formatDate(date: Date | string, pattern = 'dd/MM/yyyy HH:mm'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, pattern, { locale: ptBR })
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'HH:mm', { locale: ptBR })
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
