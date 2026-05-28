import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Driver, DriverFilters } from '@/data/types'

export function useDrivers(filters?: DriverFilters) {
  const q = useQuery({
    queryKey: ['drivers', filters],
    queryFn: async () => {
      const { data, error } = await api.api.drivers.get({ query: (filters ?? {}) as any })
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch drivers')
      return (data ?? []) as Driver[]
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

export function useDriver(id: string | null) {
  const q = useQuery({
    queryKey: ['driver', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (api.api.drivers as any)[id!].get()
      if (error) throw new Error((error.value as any)?.error ?? 'Not found')
      return (data ?? null) as Driver | null
    },
  })
  return {
    data:      q.data ?? null,
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}
