import { useState } from 'react'
import { Phone, Loader2, AlertTriangle } from 'lucide-react'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { SeverityBadge } from '@/components/domain/SeverityBadge'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { CommunicationsLog } from '@/components/domain/CommunicationsLog'
import { LogCallDialog } from '@/components/domain/LogCallDialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatDate, formatRelative } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Alert, AlertStatus, Priority } from '@/data/types'
import { AlertStatusStepper } from './AlertStatusStepper'
import { AlertCommentThread } from './AlertCommentThread'
import {
  useAlertHistory, useTransitionAlert, useAddAlertComment, useSetAlertPriority,
} from '@/hooks/useAlertWorkflow'

interface Props {
  alert:   Alert
  onClose: () => void
}

const PRIORITY_TONE: Record<Priority, string> = {
  alta:  'bg-danger/10 text-danger',
  media: 'bg-warning/10 text-warning',
  baixa: 'bg-muted text-muted-foreground',
}

export function AlertDetailPanel({ alert, onClose }: Props) {
  const { data: history = [], isLoading: historyLoading } = useAlertHistory(alert.id)
  const transition = useTransitionAlert(alert.id)
  const comment    = useAddAlertComment(alert.id)
  const setPrio    = useSetAlertPriority(alert.id)
  const [confirmTo,      setConfirmTo]      = useState<AlertStatus | null>(null)
  const [callDialogOpen, setCallDialogOpen] = useState(false)

  const isPending = transition.isPending || comment.isPending || setPrio.isPending
  const priority  = alert.priority ?? 'media'

  function handleTransitionSelect(to: AlertStatus) {
    // Direct path for benign moves; confirmation step for terminal-ish ones
    if (to === 'resolvido' || to === 'encerrado') {
      setConfirmTo(to)
      return
    }
    transition.mutate({ to })
  }

  function confirmTransition() {
    if (!confirmTo) return
    transition.mutate({ to: confirmTo }, { onSettled: () => setConfirmTo(null) })
  }

  return (
    <SidePanelLayout
      title={alert.title}
      subtitle={`Alerta #${alert.id.slice(0, 8).toUpperCase()} · ${alert.tripCode}`}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          {transition.isError && (
            <div className="flex items-start gap-1.5 text-[11px] text-danger px-1">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{(transition.error as Error)?.message}</span>
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs gap-1.5"
            onClick={() => setCallDialogOpen(true)}
            disabled={!alert.driverId}
          >
            <Phone className="h-3.5 w-3.5" /> Ligar para motorista
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Severity + priority chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <SeverityBadge severity={alert.severity} size="md" />
          <select
            value={priority}
            onChange={(e) => setPrio.mutate(e.target.value as Priority)}
            disabled={isPending}
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border-0 outline-none focus:ring-2 focus:ring-primary/30',
              PRIORITY_TONE[priority],
            )}
          >
            <option value="alta">Prioridade alta</option>
            <option value="media">Prioridade média</option>
            <option value="baixa">Prioridade baixa</option>
          </select>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: 'color-mix(in oklch, var(--primary) 15%, transparent)', color: 'var(--primary)' }}
          >
            {alert.source}
          </span>
        </div>

        {/* Status stepper */}
        <div className="rounded-md border border-border p-2.5 bg-card">
          <AlertStatusStepper
            current={alert.status}
            onSelect={handleTransitionSelect}
            isPending={isPending}
          />
          {transition.isPending && (
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Aplicando transição...
            </div>
          )}
        </div>

        {/* Confirmation banner for terminal transitions */}
        {confirmTo && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs space-y-2">
            <p className="text-foreground">
              Confirmar transição para <strong className="capitalize">{confirmTo.replace('_', ' ')}</strong>?
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={confirmTransition} disabled={transition.isPending}>Confirmar</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmTo(null)}>Cancelar</Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <Field label="Abertura" value={formatDate(alert.occurredAt, 'dd/MM HH:mm')} />
          <Field label="Em andamento há" value={formatRelative(alert.occurredAt)} />
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Detalhes</h4>
          <div className="space-y-2 text-xs text-muted-foreground">
            <Row label="Entrega/Rota" value={`${alert.tripCode} · ${alert.routeCode}`} />
            <Row label="Cliente"       value={alert.clientName} />
            {alert.delayMinutes !== undefined && <Row label="Desvio ETA" value={`+${alert.delayMinutes} min`} highlight="text-danger" />}
            {alert.deviationKm !== undefined  && <Row label="Desvio rota" value={`${alert.deviationKm.toFixed(1)} km`} highlight="text-warning" />}
            {alert.lat && alert.lng && <Row label="Local" value={`${alert.lat.toFixed(4)}, ${alert.lng.toFixed(4)}`} mono />}
            <Row label="Descrição" value={alert.description} />
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Motorista</h4>
          <div className="flex items-center gap-3">
            <DriverAvatar name={alert.driverName} photoUrl={alert.driverPhoto} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{alert.driverName}</p>
              <p className="text-xs text-muted-foreground font-mono">{alert.plate}</p>
            </div>
          </div>
        </div>

        {alert.slaDeadline && (
          <>
            <Separator />
            <div className="rounded-md p-3" style={{ backgroundColor: 'var(--status-em-risco-bg)', borderColor: 'var(--status-em-risco-fg)', border: '1px solid' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--status-em-risco-fg)' }}>Prazo SLA da tratativa</p>
              <p className="text-sm mt-0.5 text-foreground">{formatDate(alert.slaDeadline, 'dd/MM HH:mm')} ({formatRelative(alert.slaDeadline)})</p>
            </div>
          </>
        )}

        <Separator />

        {/* Comment thread + composer */}
        {historyLoading ? (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando histórico...
          </div>
        ) : (
          <AlertCommentThread
            items={history}
            onSubmit={(text) => comment.mutate(text)}
            isPending={comment.isPending}
          />
        )}

        {/* Communications log for this alert — Sprint 7 */}
        <Separator />
        <div>
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Comunicações</h4>
          <CommunicationsLog scope={{ alertId: alert.id }} emptyMessage="Sem ligações registradas para esta ocorrência." />
        </div>
      </div>

      {/* Call log dialog */}
      <LogCallDialog
        scope={{ alertId: alert.id, driverId: alert.driverId, tripId: alert.tripId }}
        open={callDialogOpen}
        onClose={() => setCallDialogOpen(false)}
      />
    </SidePanelLayout>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}

function Row({ label, value, highlight, mono }: { label: string; value: string; highlight?: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right ${highlight ?? 'text-foreground'} ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
