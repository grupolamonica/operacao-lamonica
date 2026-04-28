import { cn } from '@/lib/utils'

const config = {
  no_prazo:  { label: 'No prazo',  classes: 'bg-green-100 text-green-700' },
  em_risco:  { label: 'Em risco',  classes: 'bg-yellow-100 text-yellow-700' },
  atrasado:  { label: 'Atrasado',  classes: 'bg-red-100 text-red-700' },
  sem_sinal: { label: 'Sem sinal', classes: 'bg-gray-100 text-gray-500' },
} as const

export type SlaStatus = keyof typeof config

interface Props {
  status: SlaStatus
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, size = 'sm' }: Props) {
  const { label, classes } = config[status]
  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-medium whitespace-nowrap',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      classes,
    )}>
      {label}
    </span>
  )
}
