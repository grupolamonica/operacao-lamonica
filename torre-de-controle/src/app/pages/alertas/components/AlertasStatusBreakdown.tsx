import { cn } from '@/lib/utils'
import { useAlertasKPIs } from '@/hooks/useDashboardKPIs'

type StatusKey = 'aberto' | 'em_analise' | 'em_tratativa' | 'resolvido' | 'encerrado'

const STATUS_LABELS: Record<StatusKey, string> = {
  aberto:       'Novas',
  em_analise:   'Em análise',
  em_tratativa: 'Em tratativa',
  resolvido:    'Resolvidas',
  encerrado:    'Encerradas',
}

const STATUS_COLORS: Record<StatusKey, string> = {
  aberto:       'bg-danger',
  em_analise:   'bg-warning',
  em_tratativa: 'bg-info',
  resolvido:    'bg-success',
  encerrado:    'bg-muted-foreground',
}

interface Props {
  activeStatus?: StatusKey | null
  onSelect?:     (s: StatusKey | null) => void
}

export function AlertasStatusBreakdown({ activeStatus, onSelect }: Props) {
  const { data: k } = useAlertasKPIs()
  const breakdown = k.byStatus ?? {
    aberto: k.abertos.count, em_analise: 0, em_tratativa: 0, resolvido: 0, encerrado: 0,
  }
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0)

  return (
    <div className="bg-card rounded-lg shadow-md p-4 border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Funil de ocorrências
        </span>
        <span className="text-[10px] text-muted-foreground">{total} totais</span>
      </div>

      <div className="space-y-2">
        {(Object.entries(STATUS_LABELS) as [StatusKey, string][]).map(([key, label]) => {
          const count = breakdown[key] ?? 0
          const pct   = total > 0 ? Math.round((count / total) * 100) : 0
          const isActive = activeStatus === key
          return (
            <button
              key={key}
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(isActive ? null : key)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                onSelect && 'hover:bg-accent cursor-pointer',
                isActive && 'bg-accent ring-1 ring-primary/30',
                !onSelect && 'cursor-default',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full shrink-0', STATUS_COLORS[key])} />
              <span className="text-xs text-foreground flex-1 truncate">{label}</span>
              <span className="text-xs font-medium text-foreground tabular-nums">{count}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums w-9 text-right">{pct}%</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
