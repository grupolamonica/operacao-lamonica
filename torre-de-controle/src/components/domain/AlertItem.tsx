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
        'flex items-start gap-3 p-3 rounded-md border transition-colors',
        selected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50',
        onClick && 'cursor-pointer',
      )}
    >
      <SeverityBadge severity={alert.severity} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span>{formatTime(alert.occurredAt)}</span>
          <span>·</span>
          <span>{formatRelative(alert.occurredAt)}</span>
        </div>
        <p className="text-sm font-medium text-gray-900 truncate">{alert.title}</p>
        {alert.subtitle && <p className="text-xs text-gray-500 truncate">{alert.subtitle}</p>}
        <div className="flex items-center gap-2 mt-2">
          <DriverAvatar name={alert.driverName} photoUrl={alert.driverPhoto} size="sm" />
          <span className="text-xs text-gray-700 truncate">{alert.driverName}</span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs font-mono text-gray-500">{alert.plate}</span>
          {alert.clientName && (
            <>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500 truncate">{alert.clientName}</span>
            </>
          )}
        </div>
        {alert.delayMinutes !== undefined && (
          <p className="text-[11px] text-red-600 font-medium mt-1">
            Desvio ETA: +{alert.delayMinutes} min
          </p>
        )}
      </div>
      {variant === 'queue' && (onAssume || onCall) && (
        <div className="flex flex-col gap-1.5 shrink-0">
          {onAssume && (
            <Button size="sm" className="h-7 text-xs bg-[#0f62fe] hover:bg-[#0353d9]" onClick={(e) => { e.stopPropagation(); onAssume(alert.id) }}>
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
        <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 mt-1" />
      )}
    </div>
  )
}
