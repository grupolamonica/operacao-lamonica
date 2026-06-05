import { cn } from '@/lib/utils'

const config = {
  no_prazo:  { label: 'No prazo' },
  em_risco:  { label: 'Em risco' },
  atrasado:  { label: 'Atrasado' },
  sem_sinal: { label: 'Sem sinal' },
} as const

const styleMap = {
  no_prazo:  { backgroundColor: 'var(--status-no-prazo-bg)',  color: 'var(--status-no-prazo-fg)' },
  em_risco:  { backgroundColor: 'var(--status-em-risco-bg)',  color: 'var(--status-em-risco-fg)' },
  atrasado:  { backgroundColor: 'var(--status-atrasado-bg)',  color: 'var(--status-atrasado-fg)' },
  sem_sinal: { backgroundColor: 'var(--status-sem-sinal-bg)', color: 'var(--status-sem-sinal-fg)' },
} as const

export type SlaStatus = keyof typeof config

interface Props {
  status: SlaStatus | null | undefined
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, size = 'sm' }: Props) {
  // Dado real pode trazer sla_status null/desconhecido (viagens sem janela
  // avaliada, concluídas/canceladas). Fallback tolerante — não quebra a tela. (Phase 12)
  const label = (status && config[status]?.label) ?? '—'
  const style = (status && styleMap[status]) || { backgroundColor: 'var(--muted, #e2e8f0)', color: 'var(--muted-foreground, #64748b)' }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      )}
      style={style}
    >
      {label}
    </span>
  )
}
