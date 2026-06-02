import { useState } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KPICard } from '@/components/domain/KPICard'
import { useBiKpis, useBiBreakdown, useBiTrend, type BiPeriod, type BiDimension, type BiMetric } from '@/hooks/useBi'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const PERIODS: Array<{ id: BiPeriod; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: '7d',    label: '7 dias' },
  { id: '30d',   label: '30 dias' },
  { id: '90d',   label: '90 dias' },
]

const DIMENSIONS: Array<{ id: BiDimension; label: string }> = [
  { id: 'client', label: 'Por cliente' },
  { id: 'driver', label: 'Por motorista' },
  { id: 'region', label: 'Por região' },
  { id: 'route',  label: 'Por rota' },
]

const METRICS: Array<{ id: BiMetric; label: string; suffix?: string; color: string }> = [
  { id: 'deliveries', label: 'Entregas',     suffix: '',    color: '#0f62fe' },
  { id: 'sla_pct',    label: 'SLA',          suffix: '%',   color: '#2dce89' },
  { id: 'alerts',     label: 'Ocorrências',  suffix: '',    color: '#f5365c' },
  { id: 'delay_avg',  label: 'Atraso médio', suffix: ' min', color: '#fb6340' },
]

export function BiExecutivoPage() {
  const [period, setPeriod] = useState<BiPeriod>('30d')
  const [dimension, setDimension] = useState<BiDimension>('client')
  const [metric, setMetric] = useState<BiMetric>('deliveries')

  const { data: kpis } = useBiKpis({ period })
  const { data: breakdown, isLoading: breakdownLoading } = useBiBreakdown({ period, dimension })
  const { data: trend,     isLoading: trendLoading     } = useBiTrend({ period, metric })

  const trendActive = METRICS.find((m) => m.id === metric)!

  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">BI Executivo</h1>
          <p className="text-sm text-white/70">Visão estratégica — entregas, SLA, ocorrências e ritmo da operação</p>
        </div>
        <div className="flex bg-card border border-border rounded-md overflow-hidden shadow-sm">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                period === p.id ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
              )}
            >{p.label}</button>
          ))}
        </div>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Entregas" value={kpis?.deliveries.total ?? 0} subtitle={kpis ? `${kpis.deliveries.completed} concluídas` : '—'} color="blue" />
        <KPICard title="SLA"      value={`${kpis?.sla.pct ?? 0}%`}    subtitle={kpis ? `${kpis.sla.onTime}/${kpis.sla.closed} no prazo` : '—'} color="green" />
        <KPICard title="Ocorrências abertas" value={kpis?.alerts.open ?? 0} subtitle={kpis ? `${kpis.alerts.critical} críticas` : '—'} color="red" />
        <KPICard title="Atraso médio"        value={`${kpis?.delayAvg.minutes ?? 0} min`} subtitle={kpis ? `na janela ${period}` : '—'} color="orange" />
      </div>

      {/* Risk distribution mini bar */}
      {kpis && (
        <div className="bg-card rounded-lg border border-border shadow-md p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">Distribuição de risco · viagens na janela</p>
          <div className="flex h-4 rounded-md overflow-hidden border border-border">
            <RiskBar value={kpis.risk.baixo}   color="#2dce89" />
            <RiskBar value={kpis.risk.medio}   color="#fb6340" />
            <RiskBar value={kpis.risk.alto}    color="#f97316" />
            <RiskBar value={kpis.risk.critico} color="#f5365c" />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
            <span>Baixo {kpis.risk.baixo}</span>
            <span>Médio {kpis.risk.medio}</span>
            <span>Alto {kpis.risk.alto}</span>
            <span>Crítico {kpis.risk.critico}</span>
          </div>
        </div>
      )}

      {/* Trend chart */}
      <div className="bg-card rounded-lg border border-border shadow-md p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Tendência</p>
            <p className="text-sm text-foreground mt-0.5">{trendActive.label} · {PERIODS.find(p => p.id === period)?.label}</p>
          </div>
          <div className="flex bg-muted rounded-md overflow-hidden">
            {METRICS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMetric(m.id)}
                className={cn(
                  'px-2.5 py-1 text-[11px] font-medium transition-colors',
                  metric === m.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
                )}
              >{m.label}</button>
            ))}
          </div>
        </div>
        <div style={{ height: 240 }}>
          {trendLoading ? (
            <Skeleton />
          ) : !trend || trend.length === 0 ? (
            <Empty />
          ) : (
            <Line
              data={{
                labels: trend.map((p) => {
                  const s = typeof p.date === 'string' ? p.date : new Date(p.date as any).toISOString().substring(0, 10)
                  return s.substring(5)
                }),
                datasets: [{
                  label: trendActive.label,
                  data:  trend.map((p) => p.value),
                  borderColor: trendActive.color,
                  backgroundColor: trendActive.color + '33',
                  borderWidth: 2,
                  fill: true,
                  tension: 0.3,
                  pointRadius: 2,
                  pointHoverRadius: 5,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { ticks: { color: 'rgba(160,160,180,.7)' }, grid: { color: 'rgba(160,160,180,.1)' } },
                  x: { ticks: { color: 'rgba(160,160,180,.7)' }, grid: { display: false } },
                },
              }}
            />
          )}
        </div>
      </div>

      {/* Breakdown table */}
      <div className="bg-card rounded-lg border border-border shadow-md overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2 border-b border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Breakdown</p>
          <div className="flex bg-muted rounded-md overflow-hidden">
            {DIMENSIONS.map((d) => (
              <button
                key={d.id}
                onClick={() => setDimension(d.id)}
                className={cn(
                  'px-2.5 py-1 text-[11px] font-medium transition-colors',
                  dimension === d.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
                )}
              >{d.label}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          {breakdownLoading ? (
            <div className="px-4 py-6"><Skeleton /></div>
          ) : !breakdown || breakdown.length === 0 ? (
            <div className="px-4 py-6"><Empty /></div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium">{DIMENSIONS.find(d => d.id === dimension)?.label.replace('Por ','')}</th>
                  <th className="text-right px-3 py-2 font-medium">Entregas</th>
                  <th className="text-right px-3 py-2 font-medium">Concluídas</th>
                  <th className="text-right px-3 py-2 font-medium">SLA</th>
                  <th className="text-right px-3 py-2 font-medium">Ocorrências</th>
                  <th className="text-right px-4 py-2 font-medium">Atraso médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {breakdown.slice(0, 30).map((r) => (
                  <tr key={r.key} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-2 text-foreground">{r.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{r.deliveries}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.completed}</td>
                    <td className={cn(
                      'px-3 py-2 text-right tabular-nums font-medium',
                      r.slaPct >= 95 ? 'text-success' : r.slaPct >= 85 ? 'text-warning' : 'text-danger',
                    )}>{r.slaPct}%</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{r.alertsCount}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{r.delayAvgMin > 0 ? `${r.delayAvgMin} min` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function RiskBar({ value, color }: { value: number; color: string }) {
  if (value === 0) return null
  return <div style={{ flex: value, backgroundColor: color }} title={String(value)} />
}

function Skeleton() {
  return (
    <div className="flex items-center justify-center h-full text-xs text-muted-foreground gap-1.5">
      <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
    </div>
  )
}

function Empty() {
  return <div className="flex items-center justify-center h-full text-xs text-muted-foreground italic">Sem dados nessa janela.</div>
}
