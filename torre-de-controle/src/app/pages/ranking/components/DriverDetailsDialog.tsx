import { useMemo } from 'react'
import {
  Activity, AlertCircle, Building2, CalendarDays, FileText, MapPinned,
  Route, ShieldAlert, ShieldCheck, TimerReset, Trophy,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  useRankingTrips,
  useRankingEvaluations,
  useRankingRouteScores,
  useRankingDrivers,
  type RankedDriver,
} from '@/hooks/useRanking'
import { fixMojibake } from '@/lib/mojibake'
import { cn } from '@/lib/utils'
import {
  buildDriverAnalysis,
  formatDriverRank,
  formatTripDelta,
  getDriverVinculoLabel,
  getRouteBasePoints,
  getRouteLabel,
  getSingleDriverEvaluationSummary,
  sortTripsByLatest,
  stripDriverIdSuffix,
  summarizeDriverRoutes,
  type AnalysisHighlight,
} from '@/lib/driverInsights'

/**
 * DriverDetailsDialog — full ride-rank parity (PHASE9 parity restore).
 *
 * 3 abas (Resumo / Rotas / Viagens): card "Análise da Lamônica" (verdict + summary
 * + recomendação + highlights), métricas ETA, panorama rápido, tabela "Rotas do
 * Motorista" e accordion por viagem com o detalhamento completo. Dados reais via
 * useRankingTrips + useRankingEvaluations + useRankingRouteScores; o total do
 * ranking vem de useRankingDrivers (todos cacheados pela página). READ-ONLY.
 */

interface DriverDetailsDialogProps {
  driver: RankedDriver | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** KPI compacto (ícone + label + valor) no tom Argon. */
function KpiTile({
  label, value, icon: Icon, tone = 'neutral',
}: {
  label: string
  value: string | number
  icon: typeof Trophy
  tone?: 'neutral' | 'danger'
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-3" style={{ background: 'var(--accent)' }}>
      <div
        className={cn('rounded-lg p-2', tone === 'danger' ? 'text-red-500' : 'text-primary')}
        style={{ background: 'var(--card)' }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-mono text-xl font-bold tabular-nums">{value}</div>
      </div>
    </div>
  )
}

/** Pílula de métrica ETA (On Time / Early / Delay) em %. */
function MetricPill({
  label, value, kind,
}: {
  label: string
  value: number
  kind: 'onTime' | 'early' | 'delay'
}) {
  const color = kind === 'onTime' ? 'text-emerald-500' : kind === 'early' ? 'text-blue-500' : 'text-red-500'
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--accent)' }}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-1 font-mono text-base font-semibold tabular-nums', color)}>{value.toFixed(1)}%</div>
    </div>
  )
}

function EtaBlock({
  title, icon: Icon, metrics,
}: {
  title: string
  icon: typeof TimerReset
  metrics: { onTime: number; early: number; delay: number }
}) {
  return (
    <div className="rounded-xl bg-card p-4" style={{ border: '1px solid var(--border)' }}>
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h4>
      <div className="grid grid-cols-3 gap-3">
        <MetricPill label="On Time" value={metrics.onTime} kind="onTime" />
        <MetricPill label="Early" value={metrics.early} kind="early" />
        <MetricPill label="Delay" value={metrics.delay} kind="delay" />
      </div>
    </div>
  )
}

/** Item rótulo/valor do "Panorama Rápido" e do detalhe de viagem. */
function DetailItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="space-y-1 rounded-lg px-3 py-2" style={{ background: 'var(--accent)' }}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-medium break-words">{value}</div>
    </div>
  )
}

/** Card de highlight da Análise. */
function AnalysisHighlightCard({ label, value, helper, tone }: AnalysisHighlight) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-500'
      : tone === 'warning'
        ? 'border-amber-500/25 bg-amber-500/10 text-amber-500'
        : tone === 'danger'
          ? 'border-red-500/20 bg-red-500/5 text-red-500'
          : 'bg-card text-foreground'
  return (
    <div className={cn('rounded-xl border px-3 py-3', toneClass)} style={tone === 'neutral' ? { borderColor: 'var(--border)' } : undefined}>
      <div className="text-[11px] uppercase tracking-wider opacity-75">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div className="mt-1 text-[11px] opacity-75">{helper}</div>
    </div>
  )
}

/** Badge de status ETA da viagem. */
function TripEtaBadge({ status }: { status: string }) {
  const s = (status || '').toUpperCase()
  if (s === 'ON TIME')
    return <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">{status}</Badge>
  if (s === 'EARLY')
    return <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-500/30">{status}</Badge>
  if (s === 'DELAY')
    return <Badge variant="destructive" className="text-[10px]">{status}</Badge>
  return <Badge variant="outline" className="text-[10px]">{status || '—'}</Badge>
}

export function DriverDetailsDialog({ driver, open, onOpenChange }: DriverDetailsDialogProps) {
  const { data: allTrips, isLoading: tripsLoading } = useRankingTrips()
  const { data: evaluations } = useRankingEvaluations()
  const { data: routeScores } = useRankingRouteScores()
  const { data: allDrivers } = useRankingDrivers()

  const driverTrips = useMemo(
    () => (driver ? allTrips.filter((t) => t.driver_id === driver.id) : []),
    [allTrips, driver],
  )
  const sortedTrips = useMemo(() => sortTripsByLatest(driverTrips), [driverTrips])
  const routeSummaries = useMemo(() => summarizeDriverRoutes(driverTrips), [driverTrips])
  const totalRanked = useMemo(() => allDrivers.filter((d) => d.rank !== null).length, [allDrivers])

  const evaluationSummary = useMemo(
    () =>
      driver
        ? getSingleDriverEvaluationSummary(
            driver.id,
            stripDriverIdSuffix(fixMojibake(driver.nome), driver.id),
            driverTrips,
            evaluations,
          )
        : null,
    [driver, driverTrips, evaluations],
  )

  const analysis = useMemo(
    () =>
      driver && evaluationSummary
        ? buildDriverAnalysis(
            driver,
            driverTrips,
            evaluationSummary,
            driver.rank !== null ? { position: driver.rank, total: totalRanked } : null,
          )
        : null,
    [driver, driverTrips, evaluationSummary, totalRanked],
  )

  if (!driver || !evaluationSummary || !analysis) return null

  const displayName = stripDriverIdSuffix(fixMojibake(driver.nome), driver.id)
  const vinculo = getDriverVinculoLabel(driver.vinculo)
  const isActive = driver.status === 'ATIVO'
  const rankLabel = formatDriverRank(driver.rank, totalRanked)
  const routeCount = routeSummaries.length

  const analysisToneClass =
    analysis.tone === 'success'
      ? 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/12 via-emerald-500/5 to-transparent'
      : analysis.tone === 'danger'
        ? 'border-red-500/20 bg-gradient-to-br from-red-500/12 via-red-500/5 to-transparent'
        : 'border-amber-500/20 bg-gradient-to-br from-amber-500/12 via-amber-500/5 to-transparent'
  const statusBadgeClass =
    analysis.tone === 'success'
      ? 'bg-emerald-500 text-white'
      : analysis.tone === 'danger'
        ? 'bg-red-500 text-white'
        : 'bg-amber-500 text-amber-950'
  const StatusIcon = analysis.tone === 'success' ? ShieldCheck : ShieldAlert

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="max-w-5xl p-0 gap-0 overflow-hidden sm:max-w-5xl">
        <DialogHeader className="px-6 py-5 pr-12" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1 text-left">
              <DialogTitle className="text-xl">{displayName}</DialogTitle>
              <DialogDescription>
                Resumo do motorista com foco no desempenho operacional para decisão de escala.
              </DialogDescription>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Badge
                className="text-xs"
                style={
                  isActive
                    ? { backgroundColor: 'var(--status-no-prazo-bg)', color: 'var(--status-no-prazo-fg)' }
                    : { backgroundColor: 'var(--status-atrasado-bg)', color: 'var(--status-atrasado-fg)' }
                }
              >
                {driver.status}
              </Badge>
              <Badge variant="secondary">ID {driver.id}</Badge>
              <Badge variant="outline">{vinculo}</Badge>
              <Badge variant="outline">Rank {rankLabel}</Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[82vh] space-y-5 overflow-y-auto px-6 py-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <KpiTile label="Rank" value={rankLabel} icon={Trophy} />
            <KpiTile label="Pontuação" value={driver.pontuacao} icon={Activity} />
            <KpiTile label="Viagens" value={driver.totalViagens} icon={FileText} />
            <KpiTile label="Ocorrências" value={driver.ocorrencias} icon={AlertCircle} tone={driver.ocorrencias > 0 ? 'danger' : 'neutral'} />
            <KpiTile label="Rotas" value={routeCount} icon={Route} />
          </div>

          <Tabs defaultValue="resumo" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 bg-card" style={{ border: '1px solid var(--border)' }}>
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="rotas">Rotas</TabsTrigger>
              <TabsTrigger value="viagens">Viagens</TabsTrigger>
            </TabsList>

            {/* ---- Resumo ---- */}
            <TabsContent value="resumo" className="space-y-4">
              <div className={cn('rounded-xl border p-5', analysisToneClass)}>
                <h4 className="mb-3 flex items-center gap-2 text-base font-semibold">
                  <Building2 className="h-4 w-4 text-primary" /> Análise da Lamônica
                </h4>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold', statusBadgeClass)}>
                        <StatusIcon className="h-4 w-4" />
                        {analysis.statusLabel}
                      </span>
                      <Badge variant="outline">Avaliações: {evaluationSummary.evaluationCount}</Badge>
                      <Badge variant="outline">No-show: {evaluationSummary.noShowCount}</Badge>
                      <Badge variant="outline">Comunicação: {evaluationSummary.communicationLevel}</Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="text-lg font-semibold tracking-tight">{analysis.title}</div>
                      <p className="text-sm leading-6 text-foreground/90">{analysis.summary}</p>
                    </div>
                    <div className="rounded-xl bg-card px-4 py-3" style={{ border: '1px solid var(--border)' }}>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Decisão operacional</div>
                      <div className="mt-1 text-sm font-medium">{analysis.recommendation}</div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {analysis.highlights.map((h) => (
                      <AnalysisHighlightCard key={h.label} {...h} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <EtaBlock title="ETA Origem" icon={TimerReset} metrics={driver.etaOrigMetrics} />
                <EtaBlock title="ETA Destino" icon={CalendarDays} metrics={driver.etaDestMetrics} />
              </div>

              <div className="rounded-xl bg-card p-4" style={{ border: '1px solid var(--border)' }}>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <MapPinned className="h-4 w-4 text-primary" /> Panorama Rápido
                </h4>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DetailItem label="Motorista" value={displayName} />
                  <DetailItem label="Rank no Filtro" value={rankLabel} />
                  <DetailItem label="Status" value={driver.status} />
                  <DetailItem label="Vínculo" value={vinculo} />
                  <DetailItem label="Rotas Distintas" value={routeCount} />
                  <DetailItem label="Comunicação" value={evaluationSummary.communicationLevel} />
                  <DetailItem label="Comportamento" value={evaluationSummary.behaviorLevel} />
                  <DetailItem label="Avaliações" value={evaluationSummary.evaluationCount} />
                  <DetailItem label="No-show" value={evaluationSummary.noShowCount} />
                </div>
              </div>
            </TabsContent>

            {/* ---- Rotas ---- */}
            <TabsContent value="rotas">
              <div className="rounded-xl bg-card overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <Route className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold text-foreground">Rotas do Motorista</h4>
                </div>
                <div className="overflow-x-auto">
                  {routeSummaries.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma rota no recorte.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Rota', 'Viagens', 'Pontos', 'Média', 'Ocorr.', 'Avaliadas', 'Última Viagem'].map((h, i) => (
                            <th
                              key={h}
                              className={cn('px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground', i === 0 || i === 6 ? 'text-left' : 'text-right')}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {routeSummaries.map((r) => (
                          <tr key={r.key} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td className="px-4 py-3 font-mono text-xs">{r.label}</td>
                            <td className="px-4 py-3 text-right font-mono">{r.tripCount}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold">{r.totalScore.toFixed(1)}</td>
                            <td className="px-4 py-3 text-right font-mono">{r.averageScore.toFixed(1)}</td>
                            <td className="px-4 py-3 text-right font-mono">{r.occurrenceCount}</td>
                            <td className="px-4 py-3 text-right font-mono">{r.evaluatedCount}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{r.lastTripDate || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ---- Viagens ---- */}
            <TabsContent value="viagens">
              <div className="rounded-xl bg-card overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-semibold text-foreground">Viagens e Informações Completas</h4>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {tripsLoading ? 'Carregando…' : `${sortedTrips.length} viagens`}
                  </span>
                </div>
                {sortedTrips.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {tripsLoading ? 'Carregando viagens…' : 'Nenhuma viagem para este motorista.'}
                  </p>
                ) : (
                  <Accordion type="multiple" className="px-4">
                    {sortedTrips.map((trip) => {
                      const routeLabel = getRouteLabel(trip.origin_code, trip.destination_code)
                      const basePoints = getRouteBasePoints(routeScores, trip.origin_code, trip.destination_code, trip.data)
                      const maxScore = basePoints + 2
                      return (
                        <AccordionItem key={trip.id} value={trip.id}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex w-full flex-col gap-2 text-left md:flex-row md:items-center md:justify-between md:pr-4">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs text-muted-foreground">{trip.id}</span>
                                  <Badge variant={trip.evaluated ? 'secondary' : 'outline'} className="text-[10px]">
                                    {trip.evaluated ? 'Avaliada' : 'Pendente'}
                                  </Badge>
                                  {trip.ocorrencia ? (
                                    <Badge variant="destructive" className="text-[10px]">{trip.ocorrencia_count} ocorr.</Badge>
                                  ) : null}
                                </div>
                                <div className="font-medium font-mono text-sm">{routeLabel}</div>
                                <div className="text-xs text-muted-foreground">{trip.data || '—'}</div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                <TripEtaBadge status={trip.status_eta} />
                                <TripEtaBadge status={trip.status_eta_destino} />
                                <Badge variant="outline" className="font-mono text-[10px]">
                                  {trip.score_final.toFixed(1)}/{maxScore.toFixed(1)}
                                </Badge>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <DetailItem label="ID da Viagem" value={trip.id} />
                              <DetailItem label="Data" value={trip.data || '—'} />
                              <DetailItem label="Rota" value={routeLabel} />
                              <DetailItem label="Pontuação" value={`${trip.score_final.toFixed(1)}/${maxScore.toFixed(1)}`} />
                              <DetailItem label="ETA Origem" value={trip.status_eta || '—'} />
                              <DetailItem label="ETA Destino" value={trip.status_eta_destino || '—'} />
                              <DetailItem label="Comparativo ETA Origem" value={formatTripDelta(trip.eta_origin_diff_minutes)} />
                              <DetailItem label="Comparativo ETA Destino" value={formatTripDelta(trip.eta_destination_diff_minutes)} />
                              <DetailItem label="ETA Origem Previsto" value={trip.eta_origin_scheduled || '—'} />
                              <DetailItem label="ETA Origem Realizado" value={trip.eta_origin_realized || '—'} />
                              <DetailItem label="ETA Destino Previsto" value={trip.eta_destination_scheduled || '—'} />
                              <DetailItem label="ETA Destino Realizado" value={trip.eta_destination_realized || '—'} />
                              <DetailItem label="Status Agrupado" value={trip.status_agrupado || '—'} />
                              <DetailItem label="CPT" value={trip.status_cpt || '—'} />
                              <DetailItem label="Base da Rota" value={basePoints} />
                              <DetailItem label="Vínculo" value={vinculo} />
                              <DetailItem label="Ocorrências" value={trip.ocorrencia_count} />
                              <DetailItem label="Ocorrência ETA" value={trip.ocorrencia_eta || '—'} />
                              <DetailItem label="Ocorrência CPT" value={trip.ocorrencia_cpt || '—'} />
                              <DetailItem label="Ocorrência ETA Destino" value={trip.ocorrencia_eta_destino || '—'} />
                              <DetailItem label="Origem" value={trip.origin_code || '—'} />
                              <DetailItem label="Destino" value={trip.destination_code || '—'} />
                              <DetailItem label="Avaliação" value={trip.evaluated ? 'Avaliada' : 'Pendente'} />
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )
                    })}
                  </Accordion>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
