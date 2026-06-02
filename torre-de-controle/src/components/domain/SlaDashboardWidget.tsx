import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSlaDashboard, type SlaDashboardPayload } from '@/hooks/useSla'

type Period = SlaDashboardPayload['period']

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Hoje',
  '7d':  '7 dias',
  '30d': '30 dias',
}

export function SlaDashboardWidget() {
  const [period, setPeriod] = useState<Period>('7d')
  const { data, isLoading } = useSlaDashboard(period)

  const pct       = data?.pctOnTime ?? 0
  const live      = data?.liveCounts
  const pctTone   = pct >= 95 ? 'text-success' : pct >= 85 ? 'text-warning' : 'text-danger'

  return (
    <div className="bg-card rounded-lg shadow-md border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">SLA — entregas no prazo</p>
          <p className="text-[10px] text-muted-foreground">Janela considera trips com chegada confirmada</p>
        </div>
        <div className="flex bg-muted rounded-md overflow-hidden">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-2.5 py-1 text-[11px] font-medium transition-colors',
                period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
              )}
            >{PERIOD_LABELS[p]}</button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 grid grid-cols-2 gap-4">
        <div>
          <span className={cn('text-4xl font-bold tabular-nums', pctTone)}>{pct}%</span>
          <p className="text-[10px] text-muted-foreground mt-1">
            {data ? `${data.onTimeCount} de ${data.totalCompleted} entregas` : '—'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <LiveCount icon={CheckCircle2} label="No prazo"  value={live?.no_prazo ?? 0} tone="text-success" />
          <LiveCount icon={Clock}        label="Em risco"  value={live?.em_risco ?? 0} tone="text-warning" />
          <LiveCount icon={AlertTriangle} label="Quebrado" value={live?.quebrado ?? 0} tone="text-orange-500" />
          <LiveCount icon={TrendingDown} label="Multa"    value={live?.multa ?? 0}    tone="text-danger" />
        </div>
      </div>

      {data && data.breakdownByClient.length > 0 && (
        <div className="border-t border-border bg-muted/30 px-4 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Por cliente</p>
          <ul className="space-y-1">
            {data.breakdownByClient.slice(0, 5).map((c) => (
              <li key={c.clientId} className="flex items-center gap-2 text-xs">
                <span className="text-foreground flex-1 truncate">{c.clientName}</span>
                <span className="text-muted-foreground tabular-nums">{c.onTime}/{c.total}</span>
                <span className={cn(
                  'tabular-nums font-medium w-10 text-right',
                  c.pct >= 95 ? 'text-success' : c.pct >= 85 ? 'text-warning' : 'text-danger',
                )}>{c.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading && <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">Carregando...</div>}
    </div>
  )
}

function LiveCount({ icon: Icon, label, value, tone }: { icon: typeof CheckCircle2; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1">
      <Icon className={cn('h-3 w-3 shrink-0', tone)} />
      <span className="text-[10px] text-muted-foreground truncate">{label}</span>
      <span className="text-xs font-bold tabular-nums text-foreground ml-auto">{value}</span>
    </div>
  )
}
