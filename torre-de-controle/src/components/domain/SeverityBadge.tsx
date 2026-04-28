import { cn } from '@/lib/utils'

const config = {
  critico: { label: 'Crítico' },
  medio:   { label: 'Médio' },
  baixo:   { label: 'Baixo' },
} as const

const styleMap = {
  critico: { backgroundColor: 'var(--status-atrasado-bg)',  color: 'var(--status-atrasado-fg)' },
  medio:   { backgroundColor: 'var(--status-em-risco-bg)',  color: 'var(--status-em-risco-fg)' },
  baixo:   { backgroundColor: 'var(--status-sem-sinal-bg)', color: 'var(--status-sem-sinal-fg)' },
} as const

export type AlertSeverity = keyof typeof config

interface Props {
  severity: AlertSeverity
  size?: 'sm' | 'md'
}

export function SeverityBadge({ severity, size = 'sm' }: Props) {
  const { label } = config[severity]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      )}
      style={styleMap[severity]}
    >
      {label}
    </span>
  )
}
