import { useDashboardKPIs } from '@/hooks/useDashboardKPIs'
import type { PeriodoSla } from '@/data/types'

const PERIODO_LABEL: Record<PeriodoSla, string> = { hoje: 'hoje', '7d': '7 dias', '30d': '30 dias', tudo: 'tudo' }

// Phase 13 — Resumo operacional fiel ao filtro de SLA (mesmo agregado dos cards).
export function OperationalSummary({ periodo = '30d' }: { periodo?: PeriodoSla }) {
  const { data: k } = useDashboardKPIs(periodo)

  const rows = [
    { label: 'Total de viagens',    value: k.total,             accent: '' },
    { label: 'Concluídas',          value: k.concluidas,        accent: 'text-success' },
    { label: 'No prazo',            value: k.noPrazo,           accent: 'text-success' },
    { label: 'Atrasadas',           value: k.atrasadas,         accent: 'text-danger' },
    { label: 'Exceções abertas',    value: k.alertas,           accent: 'text-warning' },
    { label: 'Tickets pendentes',   value: k.ticketsPendentes,  accent: '' },
    { label: 'Motoristas em risco', value: k.motoristasEmRisco, accent: 'text-warning' },
  ]

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Resumo operacional</h3>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{PERIODO_LABEL[periodo]}</span>
      </div>
      <ul className="space-y-2.5">
        {rows.map(r => (
          <li key={r.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{r.label}</span>
            <span className={`font-semibold tabular-nums ${r.accent || 'text-foreground'}`}>{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
