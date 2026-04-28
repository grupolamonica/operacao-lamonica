import { cn } from '@/lib/utils'

const config = {
  critico: { label: 'Crítico', classes: 'bg-red-100 text-red-700 border-red-200' },
  medio:   { label: 'Médio',   classes: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  baixo:   { label: 'Baixo',   classes: 'bg-green-100 text-green-700 border-green-200' },
} as const

export type AlertSeverity = keyof typeof config

interface Props {
  severity: AlertSeverity
  size?: 'sm' | 'md'
}

export function SeverityBadge({ severity, size = 'sm' }: Props) {
  const { label, classes } = config[severity]
  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-medium border whitespace-nowrap',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      classes,
    )}>
      {label}
    </span>
  )
}
