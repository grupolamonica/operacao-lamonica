import { cn } from '@/lib/utils'
import { useAlertasKPIs } from '@/hooks/useDashboardKPIs'

// Funil em 3 fases (igual ao fluxo do operador): Novas → Em tratativa → Concluídas.
// Agrupa os 5 status do back: em_analise entra em "Novas"; resolvido+encerrado em "Concluídas".
export type AlertPhase = 'nova' | 'tratativa' | 'concluida'

const PHASES: { key: AlertPhase; label: string; color: string; from: string[] }[] = [
  { key: 'nova',      label: 'Novas',        color: '#fb6340', from: ['aberto', 'em_analise'] },
  { key: 'tratativa', label: 'Em tratativa', color: '#5e72e4', from: ['em_tratativa'] },
  { key: 'concluida', label: 'Concluídas',   color: '#2dce89', from: ['resolvido', 'encerrado'] },
]

interface Props {
  activePhase?: AlertPhase | null
  onSelect?:    (p: AlertPhase | null) => void
}

export function AlertasStatusBreakdown({ activePhase, onSelect }: Props) {
  const { data: k } = useAlertasKPIs()
  const bs = (k.byStatus ?? { aberto: k.abertos?.count ?? 0, em_analise: 0, em_tratativa: 0, resolvido: 0, encerrado: 0 }) as Record<string, number>
  const counts = PHASES.map((p) => p.from.reduce((s, st) => s + (bs[st] ?? 0), 0))
  const total = counts.reduce((a, b) => a + b, 0)
  const max = Math.max(1, ...counts) // escala das barras pelo maior grupo (visual de funil)

  return (
    <div className="bg-card rounded-lg shadow-md p-4 border border-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Funil de ocorrências</span>
        <span className="text-[10px] text-muted-foreground">{total} no total</span>
      </div>

      <div className="space-y-2.5">
        {PHASES.map((p, i) => {
          const count = counts[i]
          const pct   = total > 0 ? Math.round((count / total) * 100) : 0
          const barW  = Math.round((count / max) * 100)
          const isActive = activePhase === p.key
          return (
            <button
              key={p.key}
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(isActive ? null : p.key)}
              className={cn(
                'w-full text-left rounded-md px-2 py-1.5 transition-colors',
                onSelect && 'hover:bg-accent cursor-pointer',
                isActive && 'bg-accent ring-1 ring-primary/30',
                !onSelect && 'cursor-default',
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
                <span className="text-xs text-foreground flex-1 truncate">{p.label}</span>
                <span className="text-xs font-semibold text-foreground tabular-nums">{count}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums w-9 text-right">{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${barW}%`, background: p.color }} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
