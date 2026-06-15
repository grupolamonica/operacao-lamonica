import { cn } from '@/lib/utils'

// Filtro de período padrão (UI Argon — grupo de botões segmentado).
// Único controle de período do sistema: mesmo visual em Dashboard, Torre,
// Viagens, Ocorrências, Insights, BI e Previsão. Genérico no id da opção para
// casar com o enum que cada backend espera (hoje/today/7d/30d/90d/tudo...).

export type Period = 'hoje' | '7d' | '30d' | '90d' | 'tudo'

/**
 * Início da janela do período (filtro client-side). null = sem corte ('tudo').
 * Aceita os ids canônicos e o 'today' do módulo de alertas.
 */
export function periodStart(period: string, now: Date = new Date()): Date | null {
  if (period === 'tudo' || !period) return null
  if (period === 'hoje' || period === 'today') {
    const d = new Date(now); d.setHours(0, 0, 0, 0); return d
  }
  const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 0
  return days ? new Date(now.getTime() - days * 86400000) : null
}

export const PERIOD_OPTIONS: ReadonlyArray<{ id: Period; label: string }> = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7d',   label: '7 dias' },
  { id: '30d',  label: '30 dias' },
  { id: '90d',  label: '90 dias' },
  { id: 'tudo', label: 'Tudo' },
]

interface Props<T extends string> {
  value: T
  onChange: (v: T) => void
  options?: ReadonlyArray<{ id: T; label: string }>
  className?: string
  /** rótulo curto à esquerda do grupo (ex.: "Período") */
  label?: string
}

export function PeriodFilter<T extends string = Period>({
  value, onChange, options = PERIOD_OPTIONS as ReadonlyArray<{ id: T; label: string }>, className, label,
}: Props<T>) {
  return (
    <div className={cn('flex items-center gap-2 shrink-0', className)}>
      {label && <span className="text-xs text-white/70">{label}</span>}
      <div className="flex bg-card border border-border rounded-md overflow-hidden shadow-sm">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={value === o.id}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
              value === o.id ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
