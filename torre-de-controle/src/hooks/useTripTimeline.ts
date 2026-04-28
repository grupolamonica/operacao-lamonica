import { useMemo } from 'react'
import { mockTimelineByTrip } from '@/data/mocks'
import type { TimelineEvent } from '@/data/types'

export function useTripTimeline(tripId: string | null): { data: TimelineEvent[]; isLoading: false; isError: false; error: null; refetch: () => void } {
  const data = useMemo(() => tripId ? (mockTimelineByTrip[tripId] ?? []) : [], [tripId])
  return { data, isLoading: false, isError: false, error: null, refetch: () => {} }
}
