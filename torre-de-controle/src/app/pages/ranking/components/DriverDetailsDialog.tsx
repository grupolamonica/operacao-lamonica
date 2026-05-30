import { useMemo } from 'react'
import { Trophy, Activity, FileText, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useRankingTrips, type RankedDriver } from '@/hooks/useRanking'
import { fixMojibake } from '@/lib/mojibake'
import { cn } from '@/lib/utils'

/**
 * DriverDetailsDialog — modal de detalhes do motorista (PHASE8-MODAIS-SHELL,
 * parte ranking). READ-ONLY: apenas exibe os dados reais do contrato Phase 7
 * (KPIs + metricas ETA + viagens do motorista). Aberto pela RankingTab ao
 * clicar numa linha.
 *
 * SIMPLIFICACAO vs ride-rank (DriverDetailsDialog.tsx) — decisao de escopo:
 *   - SEM Accordion (componente inexistente no Torre) na lista de viagens — uma
 *     tabela compacta substitui o accordion por-viagem.
 *   - SEM "Analise da Lamonica" / resumo de avaliacoes textual: dependiam de
 *     helpers do ride-rank (buildDriverAnalysis, getSingleDriverEvaluationSummary,
 *     qualityInsights) fora do escopo desta fase e de dados de avaliacao que sao
 *     escrita (Phase 9).
 *   - SEM sub-abas Tabs internas: as secoes (KPIs / ETA / Viagens) ficam
 *     empilhadas num corpo rolavel — mais simples e suficiente para leitura.
 * Entregamos os KPIs, as metricas ETA Origem/Destino e a lista de viagens do
 * motorista — os dados reais e suficientes do contrato `/api/ranking`.
 *
 * READ-ONLY: nenhum form de edicao/avaliacao, nenhuma chamada POST/PATCH/DELETE.
 */

interface DriverDetailsDialogProps {
  driver: RankedDriver | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** KPI compacto (icone + label + valor) no tom Argon. */
function KpiTile({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  icon: typeof Trophy
  tone?: 'neutral' | 'danger'
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-3"
      style={{ background: 'var(--accent)' }}
    >
      <div
        className={cn(
          'rounded-lg p-2',
          tone === 'danger' ? 'text-red-500' : 'text-primary',
        )}
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

/** Pilula de metrica ETA (On Time / Early / Delay) em %. */
function MetricPill({
  label,
  value,
  kind,
}: {
  label: string
  value: number
  kind: 'onTime' | 'early' | 'delay'
}) {
  const color =
    kind === 'onTime' ? 'text-emerald-500' : kind === 'early' ? 'text-blue-500' : 'text-red-500'
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--accent)' }}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-1 font-mono text-base font-semibold tabular-nums', color)}>
        {value.toFixed(1)}%
      </div>
    </div>
  )
}

/** Bloco "ETA Origem" / "ETA Destino" com as 3 metricas. */
function EtaBlock({
  title,
  metrics,
}: {
  title: string
  metrics: { onTime: number; early: number; delay: number }
}) {
  return (
    <div className="rounded-xl bg-card p-4" style={{ border: '1px solid var(--border)' }}>
      <h4 className="mb-3 text-sm font-semibold text-foreground">{title}</h4>
      <div className="grid grid-cols-3 gap-3">
        <MetricPill label="On Time" value={metrics.onTime} kind="onTime" />
        <MetricPill label="Early" value={metrics.early} kind="early" />
        <MetricPill label="Delay" value={metrics.delay} kind="delay" />
      </div>
    </div>
  )
}

/** Badge de status da viagem (ETA): ON TIME / EARLY / DELAY. */
function TripEtaBadge({ status }: { status: string }) {
  const s = (status || '').toUpperCase()
  if (s === 'ON TIME')
    return (
      <Badge
        variant="outline"
        className="text-[10px] text-emerald-600 border-emerald-500/30"
      >
        {status}
      </Badge>
    )
  if (s === 'EARLY')
    return (
      <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-500/30">
        {status}
      </Badge>
    )
  if (s === 'DELAY')
    return <Badge variant="destructive" className="text-[10px]">{status}</Badge>
  return <Badge variant="outline" className="text-[10px]">{status || '—'}</Badge>
}

export function DriverDetailsDialog({ driver, open, onOpenChange }: DriverDetailsDialogProps) {
  // Viagens do motorista (FECHADA). Hook chamado incondicionalmente (regras de
  // hooks); o filtro abaixo trata driver === null retornando lista vazia.
  const { data: allTrips, isLoading: tripsLoading } = useRankingTrips()

  const driverTrips = useMemo(() => {
    if (!driver) return []
    return allTrips
      .filter((t) => t.driver_id === driver.id)
      .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
  }, [allTrips, driver])

  if (!driver) return null

  const displayName = fixMojibake(driver.nome)
  const vinculo = fixMojibake(driver.vinculo)
  const isActive = driver.status === 'ATIVO'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-w-4xl p-0 gap-0 overflow-hidden sm:max-w-4xl"
      >
        <DialogHeader className="px-6 py-5 pr-12" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1 text-left">
              <DialogTitle className="text-xl">{displayName}</DialogTitle>
              <DialogDescription>
                Detalhamento operacional do motorista (somente leitura).
              </DialogDescription>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Badge
                className="text-xs"
                style={
                  isActive
                    ? {
                        backgroundColor: 'var(--status-no-prazo-bg)',
                        color: 'var(--status-no-prazo-fg)',
                      }
                    : {
                        backgroundColor: 'var(--status-atrasado-bg)',
                        color: 'var(--status-atrasado-fg)',
                      }
                }
              >
                {driver.status}
              </Badge>
              <Badge variant="secondary">ID {driver.id}</Badge>
              <Badge variant="outline">{vinculo}</Badge>
              <Badge variant="outline">Rank {driver.rank ?? '—'}</Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[80vh] space-y-5 overflow-y-auto px-6 py-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiTile label="Rank" value={driver.rank ?? '—'} icon={Trophy} />
            <KpiTile label="Pontuação" value={driver.pontuacao} icon={Activity} />
            <KpiTile label="Viagens" value={driver.totalViagens} icon={FileText} />
            <KpiTile
              label="Ocorrências"
              value={driver.ocorrencias}
              icon={AlertCircle}
              tone={driver.ocorrencias > 0 ? 'danger' : 'neutral'}
            />
          </div>

          {/* Metricas ETA */}
          <div className="grid gap-4 xl:grid-cols-2">
            <EtaBlock title="ETA Origem" metrics={driver.etaOrigMetrics} />
            <EtaBlock title="ETA Destino" metrics={driver.etaDestMetrics} />
          </div>

          {/* Viagens do motorista */}
          <div className="rounded-xl bg-card overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <h4 className="text-sm font-semibold text-foreground">Viagens</h4>
              <span className="text-xs text-muted-foreground">
                {tripsLoading ? 'Carregando…' : `${driverTrips.length} viagens`}
              </span>
            </div>
            <div className="overflow-x-auto">
              {driverTrips.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {tripsLoading ? 'Carregando viagens…' : 'Nenhuma viagem para este motorista.'}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        Viagem
                      </th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        Data
                      </th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        Rota
                      </th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        ETA Origem
                      </th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        ETA Destino
                      </th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        Score
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverTrips.map((trip) => (
                      <tr key={trip.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{trip.id}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{trip.data || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {trip.origin_code || '—'} → {trip.destination_code || '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <TripEtaBadge status={trip.status_eta} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <TripEtaBadge status={trip.status_eta_destino} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                          {trip.score_final}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
