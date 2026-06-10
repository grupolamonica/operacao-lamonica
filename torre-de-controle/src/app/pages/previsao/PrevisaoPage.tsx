import { useState } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Loader2, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useForecastDemand, useForecastRegions, useForecastDelayRisk } from '@/hooks/useForecast'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const TREND_ICON  = { up: TrendingUp, down: TrendingDown, flat: Minus } as const
const TREND_TONE  = { up: 'text-success', down: 'text-danger', flat: 'text-muted-foreground' } as const
const TREND_LABEL = { up: 'em alta',  down: 'em queda',  flat: 'estável' } as const

export function PrevisaoPage() {
  const [dimension, setDimension] = useState<'total' | 'client' | 'region'>('total')
  const { data: demand,  isLoading: demandLoading }  = useForecastDemand(7, dimension)
  const { data: regions, isLoading: regionsLoading } = useForecastRegions()
  const { data: risk,    isLoading: riskLoading }    = useForecastDelayRisk()

  const TrendIcon = demand ? TREND_ICON[demand.trend] : Minus
  const trendTone = demand ? TREND_TONE[demand.trend] : 'text-muted-foreground'

  return (
    <div className="space-y-5">
      <header className="pb-4">
        <h1 className="text-2xl font-bold text-white">Previsão</h1>
        <p className="text-sm text-white/70">Projeção operacional para os próximos 7 dias — engine estatística local</p>
      </header>

      {/* 3 forecast cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ForecastCard
          title="Demanda — próximos 7 dias"
          value={demand?.total7d ?? 0}
          subtitle={demand ? `Tendência ${TREND_LABEL[demand.trend]}` : '—'}
          tone={trendTone}
          icon={TrendIcon}
          loading={demandLoading}
        />
        <ForecastCard
          title="Risco de quebra — 24h"
          value={`${risk?.next24h.breachPct ?? 0}%`}
          subtitle={risk ? `~${risk.next24h.expectedBreaches} de ${risk.next24h.expectedTrips} entregas` : '—'}
          tone={(risk?.next24h.breachPct ?? 0) >= 15 ? 'text-danger' : (risk?.next24h.breachPct ?? 0) >= 5 ? 'text-warning' : 'text-success'}
          icon={AlertTriangle}
          loading={riskLoading}
        />
        <ForecastCard
          title="Regiões críticas — 7d"
          value={regions?.filter(r => r.riskScore >= 60).length ?? 0}
          subtitle={regions ? `de ${regions.length} regiões monitoradas` : '—'}
          tone="text-info"
          icon={MapPin}
          loading={regionsLoading}
        />
      </div>

      {/* Demand line chart with shaded forecast */}
      <div className="bg-card rounded-lg border border-border shadow-md p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Histórico + projeção</p>
            <p className="text-sm text-foreground mt-0.5">Entregas/dia · 30 dias passados, 7 dias projetados</p>
          </div>
          <div className="flex bg-muted rounded-md overflow-hidden">
            {(['total','client','region'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDimension(d)}
                className={cn(
                  'px-2.5 py-1 text-[11px] font-medium transition-colors capitalize',
                  dimension === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
                )}
              >{d === 'total' ? 'Total' : d === 'client' ? 'Por cliente' : 'Por região'}</button>
            ))}
          </div>
        </div>
        <div style={{ height: 260 }}>
          {demandLoading || !demand ? <Skeleton /> : <ProjectionChart demand={demand} />}
        </div>
      </div>

      {/* Bottom: breakdown + regions list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Breakdown (when dimension is set) */}
        {demand?.breakdown && demand.breakdown.length > 0 && (
          <div className="bg-card rounded-lg border border-border shadow-md overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Projeção 7d · {dimension === 'client' ? 'por cliente' : 'por região'}
              </p>
            </div>
            <ul className="divide-y divide-border">
              {demand.breakdown.slice(0, 8).map((b) => (
                <li key={b.key} className="flex items-center gap-3 px-4 py-2 text-xs">
                  <span className="text-foreground flex-1 truncate">{b.label}</span>
                  <span className="tabular-nums text-foreground w-12 text-right">{b.total7d}</span>
                  <span className="tabular-nums text-muted-foreground w-10 text-right">{b.share}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Regions at risk */}
        <div className="bg-card rounded-lg border border-border shadow-md overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Regiões — score composto</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">demanda projetada × % at-risk atual</p>
          </div>
          {regionsLoading ? (
            <div className="px-4 py-6"><Skeleton /></div>
          ) : !regions || regions.length === 0 ? (
            <div className="px-4 py-6"><p className="text-xs text-muted-foreground italic">Sem dados.</p></div>
          ) : (
            <ul className="divide-y divide-border">
              {regions.slice(0, 8).map((r) => (
                <li key={r.key} className="flex items-center gap-3 px-4 py-2 text-xs">
                  <span className="text-foreground flex-1 truncate">{r.label}</span>
                  <span className="tabular-nums text-muted-foreground w-14 text-right">{r.trips7d} viagens</span>
                  <span className={cn(
                    'tabular-nums font-medium w-12 text-right',
                    r.riskScore >= 70 ? 'text-danger' : r.riskScore >= 50 ? 'text-warning' : 'text-success',
                  )}>{r.riskScore}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function ForecastCard({ title, value, subtitle, tone, icon: Icon, loading }: {
  title: string; value: string | number; subtitle: string; tone: string; icon: typeof TrendingUp; loading?: boolean
}) {
  return (
    <div className="bg-card rounded-lg border border-border shadow-md p-4 relative">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-2">{title}</p>
      <div className="flex items-end gap-2">
        <span className={cn('text-3xl font-bold tabular-nums text-foreground')}>{value}</span>
        <Icon className={cn('h-5 w-5 mb-1.5', tone)} />
      </div>
      <p className="text-xs text-muted-foreground mt-1">{loading ? 'Carregando...' : subtitle}</p>
    </div>
  )
}

function ProjectionChart({ demand }: { demand: NonNullable<ReturnType<typeof useForecastDemand>['data']> }) {
  const history = demand.history
  const forecast = demand.forecast
  const labels = [...history.map(p => isoDay(p.date)), ...forecast.map(p => isoDay(p.date))]
  const historyData    = [...history.map(p => p.value), ...forecast.map(() => null)]
  const forecastData   = [...history.map(() => null), forecast[0] ? history[history.length - 1]?.value ?? null : null, ...forecast.slice(forecast[0] ? 1 : 0).map(p => p.value)]
  // Bands
  const upperBand = [...history.map(() => null), ...forecast.map(p => p.upper)]
  const lowerBand = [...history.map(() => null), ...forecast.map(p => p.lower)]

  return (
    <Line
      data={{
        labels,
        datasets: [
          { label: 'Histórico',  data: historyData,  borderColor: '#5e72e4', backgroundColor: 'rgba(94,114,228,0.15)', borderWidth: 2, tension: 0.3, pointRadius: 1.5, fill: true },
          { label: 'Projeção',   data: forecastData, borderColor: '#fb6340', backgroundColor: 'rgba(251,99,64,0.2)',  borderWidth: 2, borderDash: [5, 4], tension: 0.3, pointRadius: 2, fill: false },
          { label: 'Limite sup.', data: upperBand,    borderColor: 'rgba(251,99,64,0.4)', borderWidth: 1, borderDash: [2,2], pointRadius: 0, fill: '+1', backgroundColor: 'rgba(251,99,64,0.08)' },
          { label: 'Limite inf.', data: lowerBand,    borderColor: 'rgba(251,99,64,0.4)', borderWidth: 1, borderDash: [2,2], pointRadius: 0, fill: false },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { color: 'rgba(160,160,180,.7)', boxWidth: 10, font: { size: 10 } } },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          y: { beginAtZero: true, ticks: { color: 'rgba(160,160,180,.7)' }, grid: { color: 'rgba(160,160,180,.1)' } },
          x: { ticks: { color: 'rgba(160,160,180,.7)', maxRotation: 0, autoSkip: true }, grid: { display: false } },
        },
      }}
    />
  )
}

function isoDay(s: unknown): string {
  const str = typeof s === 'string' ? s : new Date(s as any).toISOString().substring(0, 10)
  return str.substring(5)  // MM-DD
}

function Skeleton() {
  return (
    <div className="flex items-center justify-center h-full text-xs text-muted-foreground gap-1.5">
      <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
    </div>
  )
}
