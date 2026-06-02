import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AlertStatus } from '@/data/types'

interface Step { id: AlertStatus; label: string }

const STEPS: Step[] = [
  { id: 'aberto',       label: 'Nova'        },
  { id: 'em_analise',   label: 'Em análise'  },
  { id: 'em_tratativa', label: 'Em tratativa' },
  { id: 'resolvido',    label: 'Resolvida'   },
  { id: 'encerrado',    label: 'Encerrada'   },
]

// Allowed transitions — mirrors api/src/modules/alerts/alerts.workflow.ts
const TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  aberto:       ['em_analise', 'em_tratativa', 'resolvido', 'encerrado'],
  em_analise:   ['em_tratativa', 'resolvido', 'encerrado'],
  em_tratativa: ['resolvido', 'encerrado'],
  resolvido:    ['encerrado', 'em_tratativa'],
  encerrado:    [],
}

interface Props {
  current:     AlertStatus
  onSelect?:   (to: AlertStatus) => void
  isPending?:  boolean
}

export function AlertStatusStepper({ current, onSelect, isPending }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.id === current)
  const allowed = new Set(TRANSITIONS[current])

  return (
    <ol className="flex items-center gap-1 w-full">
      {STEPS.map((step, idx) => {
        const isPast    = idx <  currentIdx
        const isCurrent = idx === currentIdx
        const canPick   = !isPending && !!onSelect && allowed.has(step.id)
        return (
          <li key={step.id} className="flex-1 min-w-0">
            <button
              type="button"
              disabled={!canPick}
              onClick={() => canPick && onSelect?.(step.id)}
              className={cn(
                'group w-full flex flex-col items-center gap-1 px-1 py-1.5 rounded-md transition-colors',
                canPick && 'hover:bg-accent cursor-pointer',
                !canPick && 'cursor-default',
              )}
            >
              <span className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold',
                isCurrent && 'bg-primary text-primary-foreground ring-2 ring-primary/30',
                isPast    && 'bg-success text-white',
                !isCurrent && !isPast && canPick    && 'bg-accent text-foreground group-hover:bg-primary group-hover:text-primary-foreground',
                !isCurrent && !isPast && !canPick   && 'bg-muted text-muted-foreground',
              )}>
                {isPast ? <Check className="h-3 w-3" /> : idx + 1}
              </span>
              <span className={cn(
                'text-[10px] text-center leading-tight truncate w-full',
                isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground',
              )}>{step.label}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
