import { CheckCircle2, AlertCircle, Circle, MapPin, Truck, Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/formatters'

export type TimelineEventKind = 'departure' | 'stop' | 'delivery' | 'alert' | 'arrival' | 'pending'

export interface TimelineEvent {
  id: string
  kind: TimelineEventKind
  title: string
  description?: string
  occurredAt: Date | string
  isCompleted?: boolean
  isCurrent?: boolean
}

const iconMap = {
  departure: Truck,
  stop:      MapPin,
  delivery:  CheckCircle2,
  alert:     AlertCircle,
  arrival:   Flag,
  pending:   Circle,
} as const

const colorMap = {
  departure: 'text-primary bg-primary/10',
  stop:      'text-muted-foreground bg-secondary',
  delivery:  'text-success bg-success/10',
  alert:     'text-danger bg-danger/10',
  arrival:   'text-info bg-info/10',
  pending:   'text-muted-foreground bg-secondary',
} as const

interface Props {
  events: TimelineEvent[]
}

export function TripTimeline({ events }: Props) {
  return (
    <ol className="relative">
      {events.map((event, idx) => {
        const Icon = iconMap[event.kind]
        const colors = colorMap[event.kind]
        const isLast = idx === events.length - 1
        return (
          <li key={event.id} className="flex gap-3 pb-4 last:pb-0">
            <div className="flex flex-col items-center shrink-0">
              <div className={cn('h-8 w-8 rounded-full flex items-center justify-center', colors, event.isCurrent && 'ring-2 ring-offset-2 ring-primary')}>
                <Icon className="h-4 w-4" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border my-1" />}
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-center justify-between gap-2">
                <p className={cn('text-sm font-medium truncate', event.isCompleted ? 'text-foreground' : 'text-muted-foreground')}>
                  {event.title}
                </p>
                <span className="text-[11px] text-muted-foreground shrink-0">{formatTime(event.occurredAt)}</span>
              </div>
              {event.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
