import { useMemo } from 'react'
import { mockTrips } from '@/data/mocks'
import type { Trip, TripFilters } from '@/data/types'

interface UseTripsReturn {
  data: Trip[]
  isLoading: false
  isError: false
  error: null
  refetch: () => void
}

export function useTrips(filters?: TripFilters): UseTripsReturn {
  const data = useMemo(() => {
    if (!filters) return mockTrips
    return mockTrips.filter(t =>
      (!filters.status     || t.status     === filters.status) &&
      (!filters.slaStatus  || t.slaStatus  === filters.slaStatus) &&
      (!filters.clientName || t.clientName === filters.clientName) &&
      (!filters.driverName || t.driverName.toLowerCase().includes(filters.driverName.toLowerCase())) &&
      (!filters.priority   || t.priority   === filters.priority) &&
      (!filters.routeCode  || t.routeCode  === filters.routeCode) &&
      (!filters.search     || (
        t.code.toLowerCase().includes(filters.search.toLowerCase()) ||
        t.driverName.toLowerCase().includes(filters.search.toLowerCase()) ||
        t.plate.toLowerCase().includes(filters.search.toLowerCase()) ||
        t.clientName.toLowerCase().includes(filters.search.toLowerCase())
      ))
    )
  }, [filters])

  return { data, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useTrip(id: string | null): { data: Trip | null; isLoading: false; isError: false; error: null; refetch: () => void } {
  const data = useMemo(() => id ? mockTrips.find(t => t.id === id) ?? null : null, [id])
  return { data, isLoading: false, isError: false, error: null, refetch: () => {} }
}
