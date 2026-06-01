import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement, CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js'
import { useThemeStore } from '@/stores/useThemeStore'
import { PanelCard } from '@/components/domain/PanelCard'
import { Skeleton } from '@/components/ui/skeleton'
import { fixMojibake } from '@/lib/mojibake'
import { useRankingTrips, useRankingDrivers } from '@/hooks/useRanking'
import type { Trip, RankedDriver, RankingFilterOpts } from '@/hooks/useRanking'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

/**
 * QualidadeTab (PHASE8-TAB-QUALIDADE) — recriacao da QualityChart do ride-rank
 * no design Torre: Chart.js (NAO Recharts) dentro de PanelCard, tema isDark.
 *
 * Read-only (CONTEXT D-V2-03). Calculos de display feitos no cliente a partir de
 * `/api/ranking/trips` (FECHADA, via useRankingTrips) e `/api/ranking/drivers`
 * (RankedDriver[] ja computado, via useRankingDrivers) — sem os helpers de
 * `qualityInsights` do ride-rank (fora de escopo / dependem de evaluations que o
 * contrato Torre nao expoe). As leituras de motorista sao derivadas dos campos
 * ja computados: pontuacao, ocorrencias, totalViagens, etaDestMetrics.delay.
 *
 * Charts: (1) % de viagens com penalidade por KPI (ETA orig delay / ETA dest
 * delay / com ocorrencia) — bar horizontal 0..100%; (2) distribuicao de
 * pontuacao dos motoristas em 5 buckets — bar vertical. Abaixo: listas de rotas
 * com mais delay/early e listas de motoristas destaque / que pedem atencao.
 *
 * @see ride-rank src/components/QualityChart.tsx (comportamento/calculos)
 * @see src/app/pages/insights/components/MotoristasRankingChart.tsx (padrao Chart.js)
 */

// Cores Argon (Chart.js exige hex puro — D-25 fallback).
const PRIMARY = '#5e72e4'
const SUCCESS = '#2dce89'
const WARNING = '#fb6340'
const DANGER  = '#f5365c'

/** Cor da barra de penalidade por faixa de % (verde baixo, laranja medio, vermelho alto). */
function penaltyColor(pct: number): string {
  if (pct > 30) return DANGER
  if (pct > 15) return WARNING
  return SUCCESS
}

const isDelay = (status: string | null | undefined) =>
  (status ?? '').trim().toUpperCase() === 'DELAY'
const isEarly = (status: string | null | undefined) =>
  (status ?? '').trim().toUpperCase() === 'EARLY'

interface KpiDatum { name: string; value: number }
interface BucketDatum { range: string; count: number }
interface RouteDatum { key: string; label: string; count: number; rate: number }

/** % de trips penalizadas por KPI (ETA orig delay, ETA dest delay, com ocorrencia). */
function computeKpiData(trips: Trip[]): KpiDatum[] {
  const total = trips.length || 1
  const pct = (n: number) => Math.round((n / total) * 100)
  return [
    { name: 'ETA Orig. Delay', value: pct(trips.filter(t => isDelay(t.status_eta)).length) },
    { name: 'ETA Dest. Delay', value: pct(trips.filter(t => isDelay(t.status_eta_destino)).length) },
    { name: 'Com Ocorrência',  value: pct(trips.filter(t => t.ocorrencia).length) },
  ]
}

/** 5 buckets de driver.pontuacao (0..maxPts), com contagem por faixa. */
function computeScoreDistribution(drivers: RankedDriver[]): BucketDatum[] {
  const maxPts = Math.max(...drivers.map(d => d.pontuacao), 1)
  const bucketSize = Math.max(1, Math.ceil(maxPts / 5))
  return Array.from({ length: 5 }, (_, i) => {
    const low = i * bucketSize
    const high = (i + 1) * bucketSize
    return {
      range: `${low}-${high}`,
      count: drivers.filter(d => d.pontuacao >= low && d.pontuacao < high).length,
    }
  })
}

/** Top rotas (origin->destination) por contagem de delay|early no destino. */
function summarizeRoutes(trips: Trip[], mode: 'delay' | 'early'): RouteDatum[] {
  const match = mode === 'delay' ? isDelay : isEarly
  const groups = new Map<string, { total: number; hits: number }>()
  for (const t of trips) {
    const key = `${t.origin_code ?? '?'}->${t.destination_code ?? '?'}`
    const g = groups.get(key) ?? { total: 0, hits: 0 }
    g.total += 1
    if (match(t.status_eta_destino)) g.hits += 1
    groups.set(key, g)
  }
  return [...groups.entries()]
    .filter(([, g]) => g.hits > 0)
    .map(([key, g]) => ({
      key,
      label: key,
      count: g.hits,
      rate: g.total > 0 ? (g.hits / g.total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
}

/** Lista compacta de rotas (reutilizada para early/delay). */
function RouteSignalList({
  title, emptyLabel, routes, tone,
}: {
  title: string
  emptyLabel: string
  routes: RouteDatum[]
  tone: 'info' | 'warning'
}) {
  const toneClass = tone === 'warning' ? 'text-[#fb6340]' : 'text-[#11cdef]'
  return (
    <div>
      <div className={`text-sm font-semibold ${toneClass}`}>{title}</div>
      <div className="mt-3 space-y-2">
        {routes.length === 0 ? (
          <div className="text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          routes.map((route, i) => (
            <div
              key={route.key}
              className="flex items-start justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
            >
              <div>
                <div className="text-xs text-muted-foreground">#{i + 1}</div>
                <div className="font-mono text-xs text-foreground">{route.label}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm font-semibold text-foreground">{route.count}</div>
                <div className="text-[11px] text-muted-foreground">{route.rate.toFixed(1)}%</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/** Linha de motorista nas listas destaque/atencao. */
function DriverRow({
  driver, tone,
}: {
  driver: RankedDriver
  tone: 'positive' | 'warning'
}) {
  const badgeClass =
    tone === 'positive'
      ? 'bg-[#2dce89]/15 text-[#2dce89]'
      : 'bg-[#f5365c]/15 text-[#f5365c]'
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{fixMojibake(driver.nome)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {driver.totalViagens} viagens · {driver.ocorrencias} ocorrências
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
          {tone === 'positive' ? 'Destaque' : 'Atenção'}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-md bg-background px-2 py-0.5 font-mono text-foreground">
          {driver.pontuacao} pts
        </span>
        <span className="rounded-md bg-background px-2 py-0.5 font-mono text-muted-foreground">
          {driver.etaDestMetrics?.delay ?? 0} delay
        </span>
      </div>
    </div>
  )
}

/** Painel de lista de motoristas (destaque ou atencao). */
function DriverInsightPanel({
  title, subtitle, emptyLabel, drivers, tone,
}: {
  title: string
  subtitle: string
  emptyLabel: string
  drivers: RankedDriver[]
  tone: 'positive' | 'warning'
}) {
  return (
    <PanelCard title={title} subtitle={subtitle}>
      <div className="space-y-3">
        {drivers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          drivers.slice(0, 5).map(d => <DriverRow key={d.id} driver={d} tone={tone} />)
        )}
      </div>
    </PanelCard>
  )
}

export function QualidadeTab({ opts }: { opts?: RankingFilterOpts }) {
  const { isDark } = useThemeStore()
  const { data: trips, isLoading: tripsLoading }     = useRankingTrips(opts)
  const { data: drivers, isLoading: driversLoading } = useRankingDrivers(opts)

  const tickColor = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)'
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'

  const kpiData           = useMemo(() => computeKpiData(trips), [trips])
  const scoreDistribution = useMemo(() => computeScoreDistribution(drivers), [drivers])
  const delayRoutes       = useMemo(() => summarizeRoutes(trips, 'delay'), [trips])
  const earlyRoutes       = useMemo(() => summarizeRoutes(trips, 'early'), [trips])

  // Motoristas destaque: melhor pontuacao com baixo risco (sem ocorrencias primeiro).
  const topDrivers = useMemo(
    () =>
      [...drivers]
        .filter(d => d.totalViagens > 0)
        .sort((a, b) => (a.ocorrencias - b.ocorrencias) || (b.pontuacao - a.pontuacao)),
    [drivers],
  )
  // Motoristas que pedem atencao: mais ocorrencias, depois maior delay no destino.
  const attentionDrivers = useMemo(
    () =>
      [...drivers]
        .filter(d => d.ocorrencias > 0 || (d.etaDestMetrics?.delay ?? 0) > 0)
        .sort(
          (a, b) =>
            (b.ocorrencias - a.ocorrencias) ||
            ((b.etaDestMetrics?.delay ?? 0) - (a.etaDestMetrics?.delay ?? 0)),
        ),
    [drivers],
  )

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Penalidade por KPI — bar horizontal 0..100% */}
        <PanelCard title="Penalidade por KPI" subtitle="% das viagens">
          <div style={{ height: 280, width: '100%' }}>
            {tripsLoading ? (
              <Skeleton className="h-full w-full" />
            ) : trips.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Sem viagens
              </div>
            ) : (
              <Bar
                key={`${isDark}-kpi`}
                data={{
                  labels: kpiData.map(k => k.name),
                  datasets: [{
                    label:           '% viagens',
                    data:            kpiData.map(k => k.value),
                    backgroundColor: kpiData.map(k => penaltyColor(k.value)),
                    borderRadius:    4,
                  }],
                }}
                options={{
                  indexAxis:           'y' as const,
                  responsive:          true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend:  { display: false },
                    tooltip: {
                      callbacks: { label: (ctx) => `${(ctx.parsed.x ?? 0).toFixed(0)}%` },
                    },
                  },
                  scales: {
                    x: {
                      min: 0, max: 100,
                      ticks: { color: tickColor, callback: (v) => v + '%' },
                      grid:  { color: gridColor },
                    },
                    y: {
                      ticks: { color: tickColor },
                      grid:  { display: false },
                    },
                  },
                }}
              />
            )}
          </div>
        </PanelCard>

        {/* Distribuicao de pontuacao — bar vertical, 5 buckets */}
        <PanelCard title="Distribuição de pontuação" subtitle="motoristas por faixa">
          <div style={{ height: 280, width: '100%' }}>
            {driversLoading ? (
              <Skeleton className="h-full w-full" />
            ) : drivers.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Sem motoristas
              </div>
            ) : (
              <Bar
                key={`${isDark}-score`}
                data={{
                  labels: scoreDistribution.map(b => b.range),
                  datasets: [{
                    label:           'Motoristas',
                    data:            scoreDistribution.map(b => b.count),
                    backgroundColor: PRIMARY,
                    borderRadius:    4,
                  }],
                }}
                options={{
                  responsive:          true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend:  { display: false },
                    tooltip: {
                      callbacks: { label: (ctx) => `${ctx.parsed.y ?? 0} motorista(s)` },
                    },
                  },
                  scales: {
                    x: {
                      ticks: { color: tickColor },
                      grid:  { display: false },
                    },
                    y: {
                      beginAtZero: true,
                      ticks: { color: tickColor, precision: 0 },
                      grid:  { color: gridColor },
                    },
                  },
                }}
              />
            )}
          </div>
        </PanelCard>
      </div>

      {/* Rotas com mais early / delay no destino */}
      <PanelCard
        title="Rotas em destaque"
        subtitle="early e delay consideram a chegada no destino"
      >
        {tripsLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <RouteSignalList
              title="Mais delay"
              emptyLabel="Nenhuma rota com delay no recorte atual."
              routes={delayRoutes}
              tone="warning"
            />
            <RouteSignalList
              title="Mais early"
              emptyLabel="Nenhuma rota com early no recorte atual."
              routes={earlyRoutes}
              tone="info"
            />
          </div>
        )}
      </PanelCard>

      {/* Listas de motoristas: destaque + atencao */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {driversLoading ? (
          <>
            <PanelCard title="Motoristas destaque"><Skeleton className="h-48 w-full" /></PanelCard>
            <PanelCard title="Motoristas que pedem atenção"><Skeleton className="h-48 w-full" /></PanelCard>
          </>
        ) : (
          <>
            <DriverInsightPanel
              title="Motoristas destaque"
              subtitle="pontuação alta, baixo risco"
              emptyLabel="Não há motoristas suficientes para destacar."
              drivers={topDrivers}
              tone="positive"
            />
            <DriverInsightPanel
              title="Motoristas que pedem atenção"
              subtitle="mais ocorrências e delay"
              emptyLabel="Nenhum motorista com alerta no recorte atual."
              drivers={attentionDrivers}
              tone="warning"
            />
          </>
        )}
      </div>
    </div>
  )
}
