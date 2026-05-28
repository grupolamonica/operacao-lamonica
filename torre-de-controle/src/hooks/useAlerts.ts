import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '@/lib/api'
import type { Alert, AlertFilters } from '@/data/types'

export function useAlerts(filters?: AlertFilters) {
  const q = useQuery({
    queryKey: ['alerts', filters],
    queryFn: async () => {
      const { data, error } = await api.api.alerts.get({ query: (filters ?? {}) as any })
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch alerts')
      return (data ?? []) as Alert[]
    },
  })
  return {
    data:      q.data ?? [],
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

export function useAlert(id: string | null) {
  const { data: all } = useAlerts()
  const data = useMemo(() => id ? all.find(a => a.id === id) ?? null : null, [id, all])
  return { data, isLoading: false as const, isError: false as const, error: null, refetch: () => {} }
}

export function useAlertsBySeverity() {
  const { data } = useAlerts()
  return useMemo(() => ({
    critico: data.filter(a => a.severity === 'critico'),
    medio:   data.filter(a => a.severity === 'medio'),
    baixo:   data.filter(a => a.severity === 'baixo'),
  }), [data])
}
