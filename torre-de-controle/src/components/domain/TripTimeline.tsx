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
  departure: 'text-blue-600 bg-blue-100',
  stop:      'text-gray-600 bg-gray-100',
  delivery:  'text-green-600 bg-green-100',
  alert:     'text-red-600 bg-red-100',
  arrival:   'text-purple-600 bg-purple-100',
  pending:   'text-gray-400 bg-gray-100',
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
              <div className={cn('h-8 w-8 rounded-full flex items-center justify-center', colors, event.isCurrent && 'ring-2 ring-offset-2 ring-blue-500')}>
                <Icon className="h-4 w-4" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-gray-200 my-1" />}
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-center justify-between gap-2">
                <p className={cn('text-sm font-medium truncate', event.isCompleted ? 'text-gray-900' : 'text-gray-500')}>
                  {event.title}
                </p>
                <span className="text-[11px] text-gray-500 shrink-0">{formatTime(event.occurredAt)}</span>
              </div>
              {event.description && (
                <p className="text-xs text-gray-500 mt-0.5">{event.description}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
