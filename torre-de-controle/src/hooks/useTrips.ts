import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Trip, TripFilters } from '@/data/types'

export function useTrips(filters?: TripFilters & { limit?: number }, opts?: { refetchMs?: number }) {
  const q = useQuery({
    queryKey: ['trips', filters],
    queryFn: async () => {
      const { data, error } = await api.api.trips.get({ query: (filters ?? {}) as any })
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch trips')
      return (data ?? []) as Trip[]
    },
    // Atualização ao vivo (default 5s, como o painel). Listas grandes podem passar um intervalo maior.
    refetchInterval: opts?.refetchMs ?? 5_000,
    refetchOnWindowFocus: true,
  })
  return {
    data:      q.data ?? [],
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

export function useTrip(id: string | null) {
  const q = useQuery({
    queryKey: ['trip', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (api.api.trips as any)[id!].get()
      if (error) throw new Error((error.value as any)?.error ?? 'Not found')
      return (data ?? null) as Trip | null
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
