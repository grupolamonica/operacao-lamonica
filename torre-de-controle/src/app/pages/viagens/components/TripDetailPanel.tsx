import { Eye, Pencil, CalendarClock } from 'lucide-react'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { MapPlaceholder } from '@/components/domain/MapPlaceholder'
import { TripTimeline } from '@/components/domain/TripTimeline'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { Button } from '@/components/ui/button'
import { useTripTimeline } from '@/hooks/useTripTimeline'
import { formatTime, formatKm, minutesBetween } from '@/lib/formatters'
import type { Trip } from '@/data/types'

interface Props {
  trip: Trip
  onClose: () => void
}

export function TripDetailPanel({ trip, onClose }: Props) {
  const { data: events } = useTripTimeline(trip.id)
  const remainingKm = Math.max(0, trip.distanceTotal - trip.distanceDone)

  return (
    <SidePanelLayout
      title={trip.code}
      subtitle={`${trip.clientName} · ${trip.routeCode}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 bg-[#0f62fe] hover:bg-[#0353d9] text-xs gap-1.5"><Eye className="h-3.5 w-3.5" /> Ver detalhes</Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5"><Pencil className="h-3.5 w-3.5" /> Editar</Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Reagendar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <StatusBadge status={trip.slaStatus} size="md" />
          <span className="text-xs text-gray-500">Prioridade: <strong className="text-gray-900 capitalize">{trip.priority}</strong></span>
        </div>

        <MapPlaceholder height={160} showLegend={false} />

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
          <h4 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">Linha do tempo</h4>
          {events.length > 0 ? <TripTimeline events={events} /> : <p className="text-xs text-gray-500">Sem eventos registrados.</p>}
        </div>
      </div>
    </SidePanelLayout>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-900 truncate">{value}</p>
    </div>
  )
}
