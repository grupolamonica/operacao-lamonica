import { Phone, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SeverityBadge, type AlertSeverity } from './SeverityBadge'
import { DriverAvatar } from './DriverAvatar'
import { formatTime, formatRelative } from '@/lib/formatters'
import { cn } from '@/lib/utils'

export interface AlertItemData {
  id: string
  severity: AlertSeverity
  title: string
  subtitle?: string
  lh?: string          // identificador da viagem (LH) — Phase 14
  driverName: string
  driverPhoto?: string
  plate: string
  clientName?: string
  occurredAt: Date | string
  delayMinutes?: number
}

interface Props {
  alert: AlertItemData
  onAssume?: (id: string) => void
  onCall?: (id: string) => void
  onClick?: (id: string) => void
  selected?: boolean
  variant?: 'queue' | 'list'  // queue = botões Assumir/Ligar; list = chevron
}

export function AlertItem({ alert, onAssume, onCall, onClick, selected, variant = 'queue' }: Props) {
  return (
    <div
      onClick={() => onClick?.(alert.id)}
      className={cn(
        'flex items-start gap-3 p-3 rounded-md border transition-colors overflow-hidden',
        selected
          ? 'border-primary/40 bg-primary/10'
          : 'border-border bg-card hover:bg-accent',
        onClick && 'cursor-pointer',
      )}
    >
      <SeverityBadge severity={alert.severity} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {alert.lh && (
            <span className="font-mono font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">
              LH {alert.lh}
            </span>
          )}
          <span>{formatTime(alert.occurredAt)}</span>
          <span>·</span>
          <span>{formatRelative(alert.occurredAt)}</span>
        </div>
        <p className="text-sm font-semibold text-foreground truncate">{alert.title}</p>
        {alert.subtitle && <p className="text-xs text-muted-foreground truncate">{alert.subtitle}</p>}
        <div className="flex items-center gap-2 mt-2">
          <DriverAvatar name={alert.driverName} photoUrl={alert.driverPhoto} size="sm" />
          <span className="text-xs text-foreground truncate">{alert.driverName}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs font-mono text-muted-foreground">{alert.plate}</span>
          {alert.clientName && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground truncate">{alert.clientName}</span>
            </>
          )}
        </div>
        {alert.delayMinutes !== undefined && (
          <p className="text-[11px] text-danger font-medium mt-1">
            Desvio ETA: +{alert.delayMinutes} min
          </p>
        )}
      </div>
      {variant === 'queue' && (onAssume || onCall) && (
        <div className="flex flex-col gap-1.5 shrink-0">
          {onAssume && (
            <Button size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); onAssume(alert.id) }}>
              Assumir
            </Button>
          )}
          {onCall && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); onCall(alert.id) }}>
              <Phone className="h-3 w-3" /> Ligar
            </Button>
          )}
        </div>
      )}
      {variant === 'list' && (
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
      )}
    </div>
  )
}
