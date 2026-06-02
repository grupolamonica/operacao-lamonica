import { Phone, ExternalLink, Hand, FileEdit, Loader2, Truck, MapPin, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { StatusBadge } from '@/components/domain/StatusBadge'
import { RiskBadge } from '@/components/domain/RiskBadge'
import { SeverityBadge } from '@/components/domain/SeverityBadge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatTime, formatRelative } from '@/lib/formatters'
import { useVehicleContext } from '@/hooks/useVehicleContext'
import { useTransitionAlert } from '@/hooks/useAlertWorkflow'

interface Props {
  vehicleId: string
  onClose:   () => void
}

export function VehicleQuickPanel({ vehicleId, onClose }: Props) {
  const { data, isLoading, isError } = useVehicleContext(vehicleId)

  if (isLoading) {
    return (
      <SidePanelLayout title="Veículo" onClose={onClose}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Carregando contexto...
        </div>
      </SidePanelLayout>
    )
  }
  if (isError || !data) {
    return (
      <SidePanelLayout title="Veículo" onClose={onClose}>
        <p className="text-xs text-danger">Falha ao carregar contexto.</p>
      </SidePanelLayout>
    )
  }

  const { vehicle, driver, activeTrip, recentAlerts, timeline } = data
  const openAlerts = recentAlerts.filter((a) => a.status !== 'resolvido' && a.status !== 'encerrado')

  return (
    <SidePanelLayout
      title={driver?.name ?? `Veículo ${vehicle.plate}`}
      subtitle={`${vehicle.plate}${activeTrip ? ` · ${activeTrip.code}` : ''}`}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          {activeTrip && (
            <Button asChild size="sm" className="w-full text-xs gap-1.5">
              <Link to={`/viagens?selected=${activeTrip.id}`}>
                <ExternalLink className="h-3.5 w-3.5" /> Abrir viagem completa
              </Link>
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" className="text-xs gap-1.5" disabled={!driver?.phone}>
              <Phone className="h-3.5 w-3.5" /> Ligar
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5">
              <FileEdit className="h-3.5 w-3.5" /> Tratativa
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Driver */}
        {driver ? (
          <div className="flex items-center gap-3">
            <DriverAvatar name={driver.name} photoUrl={driver.photoUrl ?? undefined} size="lg" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{driver.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{driver.code} · {vehicle.plate}</p>
              {driver.phone && <p className="text-xs text-muted-foreground">{driver.phone}</p>}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Truck className="h-4 w-4" /> Veículo {vehicle.plate} sem motorista vinculado
          </div>
        )}

        {/* Active trip */}
        {activeTrip ? (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-mono font-semibold text-foreground">{activeTrip.code}</span>
                <div className="flex items-center gap-1.5">
                  {activeTrip.slaStatus && <StatusBadge status={activeTrip.slaStatus} />}
                  <RiskBadge level={activeTrip.riskLevel} score={activeTrip.riskScore} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cliente</p>
                  <p className="text-foreground truncate">{activeTrip.clientName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Janela</p>
                  <p className="text-foreground tabular-nums">{formatTime(activeTrip.windowStart)} – {formatTime(activeTrip.windowEnd)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">ETA</p>
                  <p className="text-foreground tabular-nums">{activeTrip.eta ? formatTime(activeTrip.eta) : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Progresso</p>
                  <p className="text-foreground">{activeTrip.progressPct}%</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{activeTrip.origin} → {activeTrip.destination}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground italic">Sem viagem ativa</div>
        )}

        {/* Open alerts with quick assume */}
        {openAlerts.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Ocorrências em aberto ({openAlerts.length})</p>
              <ul className="space-y-1.5">
                {openAlerts.map((a) => (
                  <AlertRow key={a.id} alert={a} />
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Mini timeline */}
        {timeline.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Últimos eventos</p>
              <ol className="space-y-1.5">
                {timeline.slice(-5).reverse().map((e) => (
                  <li key={e.id} className="flex items-start gap-2 text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-foreground truncate">{e.title}</span>
                        <span className="text-muted-foreground shrink-0 text-[10px]">{formatTime(e.occurredAt)}</span>
                      </div>
                      {e.description && <p className="text-muted-foreground text-[10px] truncate">{e.description}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </div>
    </SidePanelLayout>
  )
}

function AlertRow({ alert }: { alert: { id: string; title: string; severity: any; status: any; occurredAt: string } }) {
  const transition = useTransitionAlert(alert.id)
  const canAssume = alert.status === 'aberto'
  return (
    <li className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-warning" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-foreground truncate">{alert.title}</p>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="flex items-center gap-1.5">
            <SeverityBadge severity={alert.severity} />
            <span className="text-[10px] text-muted-foreground">{formatRelative(alert.occurredAt)}</span>
          </div>
          {canAssume && (
            <Button
              size="xs"
              variant="outline"
              className="h-5 px-1.5 text-[10px] gap-1"
              disabled={transition.isPending}
              onClick={() => transition.mutate({ to: 'em_tratativa' })}
            >
              {transition.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Hand className="h-2.5 w-2.5" />}
              Assumir
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}
