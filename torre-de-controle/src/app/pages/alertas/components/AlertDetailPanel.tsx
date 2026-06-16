import { useState } from 'react'
import { Phone, Loader2, AlertTriangle, UserCheck, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '@/stores/useAuthStore'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { SeverityBadge } from '@/components/domain/SeverityBadge'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { CommunicationsLog } from '@/components/domain/CommunicationsLog'
import { LogCallDialog } from '@/components/domain/LogCallDialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatDate, formatDateUTC, formatRelative, formatRelativeWall } from '@/lib/formatters'
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
  const uid = useAuthStore((s) => s.user?.id)
  const { data: history = [], isLoading: historyLoading } = useAlertHistory(alert.id)
  const transition = useTransitionAlert(alert.id)
  const comment    = useAddAlertComment(alert.id)
  const setPrio    = useSetAlertPriority(alert.id)
  const [callDialogOpen, setCallDialogOpen] = useState(false)

  const isPending = transition.isPending || comment.isPending || setPrio.isPending
  const priority  = alert.priority ?? 'media'

  // Fluxo enxuto do operador: 3 fases (Nova → Em tratativa → Concluída).
  // Sem etapa de análise nem confirmação; o back já permite os saltos diretos.
  // 0=Nova (aberto/em_analise) · 1=Em tratativa · 2=Concluída (resolvido/encerrado)
  const phase = alert.status === 'em_tratativa' ? 1
    : (alert.status === 'resolvido' || alert.status === 'encerrado') ? 2 : 0
  const go = (to: AlertStatus) => transition.mutate({ to })

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

        {/* Identificação de quem assumiu — troca de turno / registro */}
        {alert.assignedTo && (
          <div
            className={cn('flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs',
              alert.assignedTo === uid ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}
          >
            <UserCheck className="h-4 w-4 shrink-0" />
            <span>
              {alert.assignedTo === uid
                ? 'Você está tratando este ticket.'
                : <>Assumido por <strong>{alert.assignedToName ?? 'outro operador'}</strong>. Se você está em troca de turno, pode assumir mudando o status abaixo.</>}
            </span>
          </div>
        )}

        {/* Status — 3 fases + ação contextual (1 clique pra concluir) */}
        <div className="rounded-md border border-border p-3 bg-card space-y-3">
          <AlertStatusStepper status={alert.status} />
          {transition.isPending ? (
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Atualizando…
            </div>
          ) : phase === 2 ? (
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                <CheckCircle2 className="h-4 w-4" /> Concluída{alert.resolvedAt ? ` · ${formatDate(alert.resolvedAt, 'dd/MM HH:mm')}` : ''}
              </span>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => go('em_tratativa')}>Reabrir</Button>
            </div>
          ) : phase === 1 ? (
            <Button size="sm" variant="success" className="w-full text-xs gap-1.5" onClick={() => go('resolvido')}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Concluir ocorrência
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 text-xs gap-1.5" onClick={() => go('em_tratativa')}>
                <UserCheck className="h-3.5 w-3.5" /> Assumir e tratar
              </Button>
              <Button size="sm" variant="success" className="text-xs gap-1.5" onClick={() => go('resolvido')}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Concluir
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <Field label="Abertura" value={formatDateUTC(alert.occurredAt, 'dd/MM HH:mm')} />
          <Field label="Em andamento há" value={formatRelativeWall(alert.occurredAt)} />
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Detalhes da viagem</h4>
          <div className="space-y-2 text-xs text-muted-foreground">
            {(() => {
              // Coalesce: painelMeta (ticket do painel) tem precedência; tripMeta preenche o resto.
              // Para tickets Shopee/GPS (sem painelMeta) é o tripMeta que dá o contexto ao operador.
              const tm      = alert.tripMeta
              const origem  = alert.painelMeta?.origem  ?? tm?.origem
              const destino = alert.painelMeta?.destino ?? tm?.destino
              const cavalo  = alert.painelMeta?.placa   ?? tm?.cavalo ?? alert.plate
              const kmRest  = alert.painelMeta?.kmRestante
                ?? (tm?.kmFalta != null ? String(Math.round(tm.kmFalta)) : undefined)
              const atrasado = tm?.adiantamentoHoras != null && tm.adiantamentoHoras > 0.01
              return (
                <>
                  {alert.lh && <Row label="LH" value={alert.lh} mono />}
                  {alert.painelMeta?.atraso
                    ? <Row label="Atraso" value={alert.painelMeta.atraso} highlight="text-danger" mono />
                    : atrasado && <Row label="Atraso" value={fmtHoras(tm!.adiantamentoHoras!)} highlight="text-danger" mono />}
                  {tm?.slaStatus && <Row label="SLA" value={slaLabel(tm.slaStatus)} highlight={slaTone(tm.slaStatus)} />}
                  {kmRest && <Row label="KM restante" value={`${kmRest} km`} mono />}
                  {tm?.progressPct != null && <Row label="Progresso" value={`${tm.progressPct}%`} />}
                  {cavalo && <Row label="Cavalo" value={cavalo} mono />}
                  {tm?.carreta && <Row label="Carreta" value={tm.carreta} mono />}
                  {origem && <Row label="Origem" value={origem} />}
                  {destino && <Row label="Destino" value={destino} />}
                  {tm?.windowEnd && <Row label="Prazo" value={formatDate(tm.windowEnd, 'dd/MM HH:mm')} />}
                  {tm?.eta && <Row label="ETA" value={formatDate(tm.eta, 'dd/MM HH:mm')} />}
                  {tm?.departedAt && <Row label="Em rota desde" value={formatDate(tm.departedAt, 'dd/MM HH:mm')} />}
                  {tm?.cargasStatus && <Row label="Status Cargas" value={tm.cargasStatus} />}
                  {tm?.shopeeDriverId && <Row label="ID Shopee" value={tm.shopeeDriverId} mono />}
                  {alert.painelMeta?.operador && <Row label="Operador" value={alert.painelMeta.operador} />}
                  <Row label="Entrega/Rota" value={[alert.tripCode, alert.routeCode].filter(Boolean).join(' · ') || '—'} />
                  {alert.clientName && <Row label="Cliente" value={alert.clientName} />}
                  {alert.delayMinutes !== undefined && <Row label="Desvio ETA" value={`+${alert.delayMinutes} min`} highlight="text-danger" />}
                  {alert.deviationKm !== undefined  && <Row label="Desvio rota" value={`${alert.deviationKm.toFixed(1)} km`} highlight="text-warning" />}
                  {alert.lat && alert.lng && <Row label="Local" value={`${alert.lat.toFixed(4)}, ${alert.lng.toFixed(4)}`} mono />}
                  {alert.description && <Row label="Descrição" value={alert.description} />}
                </>
              )
            })()}
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Motorista</h4>
          {/* Só o básico: nome + placa. (Para ligar, botão no rodapé.) */}
          <div className="flex items-center gap-3">
            <DriverAvatar name={alert.driverName} photoUrl={alert.driverPhoto} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{alert.driverName || '—'}</p>
              <p className="text-xs text-muted-foreground font-mono">{alert.plate || '—'}</p>
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

// adiantamentoHoras: + = ATRASADO (convenção do painel) → "+HH:MM"
function fmtHoras(h: number): string {
  const sign = h >= 0 ? '+' : '-'
  const abs = Math.abs(h)
  const hh = Math.floor(abs)
  const mm = Math.round((abs - hh) * 60)
  return `${sign}${hh}:${String(mm).padStart(2, '0')}`
}

const SLA_LABEL: Record<string, string> = {
  no_prazo: 'No prazo', em_risco: 'Em risco', atrasado: 'Atrasado', sem_sinal: 'Sem sinal',
}
const slaLabel = (s: string) => SLA_LABEL[s] ?? s
const slaTone = (s: string) =>
  s === 'atrasado' || s === 'sem_sinal' ? 'text-danger' : s === 'em_risco' ? 'text-warning' : 'text-success'

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
