import { Eye, Pencil, CalendarClock } from 'lucide-react'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { LiveMap } from '@/components/domain/LiveMap'
import { TripTimeline } from '@/components/domain/TripTimeline'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { RiskBadge } from '@/components/domain/RiskBadge'
import { Button } from '@/components/ui/button'
import { useTripTimeline } from '@/hooks/useTripTimeline'
import { useTripRisk } from '@/hooks/useTripRisk'
import { formatTime, formatKm, minutesBetween } from '@/lib/formatters'
import type { Trip } from '@/data/types'

interface Props {
  trip: Trip
  onClose: () => void
}

export function TripDetailPanel({ trip, onClose }: Props) {
  const { data: events } = useTripTimeline(trip.id)
  const { data: risk }   = useTripRisk(trip.id)
  const remainingKm = Math.max(0, trip.distanceTotal - trip.distanceDone)

  return (
    <SidePanelLayout
      title={trip.code}
      subtitle={`${trip.clientName} · ${trip.routeCode}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 text-xs gap-1.5"><Eye className="h-3.5 w-3.5" /> Ver detalhes</Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5"><Pencil className="h-3.5 w-3.5" /> Editar</Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Reagendar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <StatusBadge status={trip.slaStatus} size="md" />
            <RiskBadge level={risk?.level ?? trip.riskLevel} score={risk?.score ?? trip.riskScore} size="md" />
          </div>
          <span className="text-xs text-muted-foreground">Prioridade: <strong className="text-foreground capitalize">{trip.priority}</strong></span>
        </div>

        {risk && risk.factors.length > 0 && (
          <div className="rounded-md border border-border p-2.5 bg-card space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Score de risco · {risk.score}</p>
            <ul className="space-y-1">
              {risk.factors.map((f) => (
                <li key={f.key} className="flex items-center gap-2 text-[11px]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-foreground truncate">{f.label}</span>
                      <span className="text-muted-foreground tabular-nums shrink-0">{f.contribution}/{f.weight}</span>
                    </div>
                    {f.detail && <p className="text-[10px] text-muted-foreground truncate">{f.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <LiveMap height={160} showLegend={false} />

        <div className="grid grid-cols-2 gap-3 text-xs">
          <Metric label="Origem" value={trip.origin} />
          <Metric label="Destino" value={trip.destination} />
          <Metric label="Janela" value={`${formatTime(trip.windowStart)} – ${formatTime(trip.windowEnd)}`} />
          <Metric label="ETA atual" value={formatTime(trip.eta)} />
          <Metric label="Distância total" value={formatKm(trip.distanceTotal)} />
          <Metric label="Restante" value={formatKm(remainingKm)} />
          <Metric label="Progresso" value={`${trip.progressPct}%`} />
          <Metric label="Desvio ETA" value={`${minutesBetween(trip.windowEnd, trip.eta) > 0 ? '+' : ''}${minutesBetween(trip.windowEnd, trip.eta)} min`} />
        </div>

        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Linha do tempo</h4>
          {events.length > 0 ? <TripTimeline events={events} /> : <p className="text-xs text-muted-foreground">Sem eventos registrados.</p>}
        </div>
      </div>
    </SidePanelLayout>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-foreground truncate">{value}</p>
    </div>
  )
}
