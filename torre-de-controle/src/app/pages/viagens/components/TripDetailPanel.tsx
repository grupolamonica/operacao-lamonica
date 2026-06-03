import { useState } from 'react'
import { Phone, StickyNote, AlertTriangle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { LiveMap } from '@/components/domain/LiveMap'
import { TripTimeline } from '@/components/domain/TripTimeline'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { RiskBadge } from '@/components/domain/RiskBadge'
import { CommunicationsLog } from '@/components/domain/CommunicationsLog'
import { LogCallDialog } from '@/components/domain/LogCallDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { api } from '@/lib/api'
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
  const qc = useQueryClient()
  const remainingKm = Math.max(0, trip.distanceTotal - trip.distanceDone)

  const [callOpen, setCallOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [occOpen, setOccOpen]   = useState(false)
  const [noteText, setNoteText] = useState('')
  const [occTitle, setOccTitle] = useState('')
  const [occSeverity, setOccSeverity] = useState<'critico' | 'medio' | 'baixo'>('medio')

  const postNote = useMutation({
    mutationFn: async () => {
      const { error } = await (api.api.trips as any)[trip.id].note.post({ text: noteText })
      if (error) throw new Error('Falha ao salvar nota')
    },
    onSuccess: () => {
      setNoteText(''); setNoteOpen(false)
      qc.invalidateQueries({ queryKey: ['trip-timeline', trip.id] })
    },
  })

  const postOcc = useMutation({
    mutationFn: async () => {
      const { error } = await (api.api.alerts as any).post({
        type: 'manual', severity: occSeverity, title: occTitle,
        tripId: trip.id, driverId: trip.driverId,
      })
      if (error) throw new Error('Falha ao abrir ocorrência')
    },
    onSuccess: () => {
      setOccTitle(''); setOccOpen(false)
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['trip-timeline', trip.id] })
    },
  })

  return (
    <SidePanelLayout
      title={trip.code}
      subtitle={`${trip.clientName} · ${trip.routeCode}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 text-xs gap-1.5" onClick={() => setCallOpen(true)}><Phone className="h-3.5 w-3.5" /> Ligar</Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setNoteOpen(true)}><StickyNote className="h-3.5 w-3.5" /> Nota</Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setOccOpen(true)}><AlertTriangle className="h-3.5 w-3.5" /> Ocorrência</Button>
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
          <Metric label="Motorista" value={trip.driverName} />
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

        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Comunicações</h4>
          <CommunicationsLog scope={{ tripId: trip.id }} emptyMessage="Sem comunicações registradas para esta viagem." />
        </div>
      </div>

      {/* Ligar motorista */}
      <LogCallDialog scope={{ tripId: trip.id }} open={callOpen} onClose={() => setCallOpen(false)} />

      {/* Adicionar nota */}
      <Dialog open={noteOpen} onOpenChange={(v) => { if (!v) setNoteOpen(false) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar nota — {trip.code}</DialogTitle></DialogHeader>
          <textarea
            className="w-full h-28 rounded-md border border-border bg-background p-2 text-sm"
            placeholder="Nota do operador (vai para a linha do tempo da viagem)…"
            value={noteText} onChange={(e) => setNoteText(e.target.value)}
          />
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setNoteOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={!noteText.trim() || postNote.isPending} onClick={() => postNote.mutate()}>
              {postNote.isPending ? 'Salvando…' : 'Salvar nota'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Abrir ocorrência */}
      <Dialog open={occOpen} onOpenChange={(v) => { if (!v) setOccOpen(false) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Abrir ocorrência — {trip.code}</DialogTitle></DialogHeader>
          <input
            className="w-full rounded-md border border-border bg-background p-2 text-sm"
            placeholder="Título da ocorrência…"
            value={occTitle} onChange={(e) => setOccTitle(e.target.value)}
          />
          <select
            className="w-full rounded-md border border-border bg-background p-2 text-sm"
            value={occSeverity} onChange={(e) => setOccSeverity(e.target.value as 'critico' | 'medio' | 'baixo')}
          >
            <option value="critico">Crítica</option>
            <option value="medio">Média</option>
            <option value="baixo">Baixa</option>
          </select>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setOccOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={!occTitle.trim() || postOcc.isPending} onClick={() => postOcc.mutate()}>
              {postOcc.isPending ? 'Abrindo…' : 'Abrir ocorrência'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
