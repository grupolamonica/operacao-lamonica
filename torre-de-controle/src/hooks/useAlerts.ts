import { useMemo } from 'react'
import { mockAlerts } from '@/data/mocks'
import type { Alert, AlertFilters } from '@/data/types'

interface UseAlertsReturn {
  data: Alert[]
  isLoading: false
  isError: false
  error: null
  refetch: () => void
}

export function useAlerts(filters?: AlertFilters): UseAlertsReturn {
  const data = useMemo(() => {
    if (!filters) return mockAlerts
    return mockAlerts.filter(a =>
      (!filters.severity   || a.severity   === filters.severity) &&
      (!filters.status     || a.status     === filters.status) &&
      (!filters.type       || a.type       === filters.type) &&
      (!filters.clientName || a.clientName === filters.clientName) &&
      (!filters.routeCode  || a.routeCode  === filters.routeCode) &&
      (!filters.assignedTo || a.assignedTo === filters.assignedTo) &&
      (!filters.search     || (
        a.title.toLowerCase().includes(filters.search.toLowerCase()) ||
        a.driverName.toLowerCase().includes(filters.search.toLowerCase()) ||
        a.plate.toLowerCase().includes(filters.search.toLowerCase()) ||
        a.tripCode.toLowerCase().includes(filters.search.toLowerCase())
      ))
    )
  }, [filters])

  return { data, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useAlert(id: string | null): { data: Alert | null; isLoading: false; isError: false; error: null; refetch: () => void } {
  const data = useMemo(() => id ? mockAlerts.find(a => a.id === id) ?? null : null, [id])
  return { data, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useAlertsBySeverity(): {
  critico: Alert[]
  medio: Alert[]
  baixo: Alert[]
} {
  return useMemo(() => ({
    critico: mockAlerts.filter(a => a.severity === 'critico'),
    medio:   mockAlerts.filter(a => a.severity === 'medio'),
    baixo:   mockAlerts.filter(a => a.severity === 'baixo'),
  }), [])
}
