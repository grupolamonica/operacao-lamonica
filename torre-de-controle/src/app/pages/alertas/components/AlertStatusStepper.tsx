import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AlertStatus } from '@/data/types'

// Visão simplificada do operador: 3 fases. Os 5 status do back colapsam aqui —
// 'em_analise' some (vira parte de "Nova") e 'resolvido'/'encerrado' viram "Concluída".
const PHASES = [
  { key: 'nova',       label: 'Nova'         },
  { key: 'tratativa',  label: 'Em tratativa' },
  { key: 'concluida',  label: 'Concluída'    },
] as const

/** status do back → índice da fase visual (0=Nova, 1=Em tratativa, 2=Concluída). */
function phaseOf(status: AlertStatus): number {
  if (status === 'em_tratativa') return 1
  if (status === 'resolvido' || status === 'encerrado') return 2
  return 0 // aberto, em_analise
}

export function AlertStatusStepper({ status }: { status: AlertStatus }) {
  const cur = phaseOf(status)
  const concluded = cur === 2

  return (
    <ol className="flex items-start gap-1 w-full">
      {PHASES.map((p, idx) => {
        // verde = fase já passada OU a última fase quando concluída (corrige o bug
        // do último tópico não ficar verde ao concluir).
        const done    = idx < cur || (idx === cur && concluded)
        const current = idx === cur && !concluded
        return (
          <li key={p.key} className="flex-1 min-w-0 flex flex-col items-center gap-1">
            <span className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
              done    && 'bg-success text-white',
              current && 'bg-primary text-primary-foreground ring-2 ring-primary/30',
              !done && !current && 'bg-muted text-muted-foreground',
            )}>
              {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
            </span>
            <span className={cn(
              'text-[10px] text-center leading-tight truncate w-full',
              (done || current) ? 'text-foreground font-medium' : 'text-muted-foreground',
            )}>{p.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
