import { useMemo } from 'react'
import { mockDrivers } from '@/data/mocks'
import type { Driver, DriverFilters } from '@/data/types'

interface UseDriversReturn {
  data: Driver[]
  isLoading: false
  isError: false
  error: null
  refetch: () => void
}

export function useDrivers(filters?: DriverFilters): UseDriversReturn {
  const data = useMemo(() => {
    if (!filters) return mockDrivers
    return mockDrivers.filter(d =>
      (!filters.status || d.status === filters.status) &&
      (!filters.base   || d.base   === filters.base) &&
      (!filters.search || (
        d.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        d.code.toLowerCase().includes(filters.search.toLowerCase()) ||
        d.plate.toLowerCase().includes(filters.search.toLowerCase())
      ))
    )
  }, [filters])

  return { data, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useDriver(id: string | null): { data: Driver | null; isLoading: false; isError: false; error: null; refetch: () => void } {
  const data = useMemo(() => id ? mockDrivers.find(d => d.id === id) ?? null : null, [id])
  return { data, isLoading: false, isError: false, error: null, refetch: () => {} }
}
