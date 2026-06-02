import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { TimelineEvent } from '@/data/types'

// Server payload (mirror of api/src/modules/trips/timeline.service.ts:TimelineItem).
// Kept narrow on purpose — hooks/UI consume TimelineEvent which is the shared contract.
type ServerTimelineItem = {
  id:           string
  source:       'trip_event' | 'alert' | 'treatment'
  kind:         TimelineEvent['kind']
  eventType:    string
  title:        string
  description?: string
  occurredAt:   string
  isCompleted?: boolean
  isCurrent?:   boolean
}

function toTimelineEvent(item: ServerTimelineItem, tripId: string): TimelineEvent {
  return {
    id:          item.id,
    tripId,
    kind:        item.kind,
    title:       item.title,
    description: item.description,
    occurredAt:  new Date(item.occurredAt),
    isCompleted: item.isCompleted ?? false,
    isCurrent:   item.isCurrent   ?? false,
  }
}

export function useTripTimeline(tripId: string | null) {
  const q = useQuery({
    queryKey: ['trip-timeline', tripId],
    enabled:  !!tripId,
    queryFn:  async (): Promise<TimelineEvent[]> => {
      const { data, error } = await (api.api.trips as any)[tripId!].timeline.get()
      if (error) throw new Error('Failed to fetch trip timeline')
      const items = (data ?? []) as ServerTimelineItem[]
      return items.map((i) => toTimelineEvent(i, tripId!))
    },
    staleTime: 30_000,
  })

  return {
    data:      q.data ?? [],
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error as Error | null,
    refetch:   q.refetch,
  }
}
