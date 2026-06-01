/**
 * useFleetPositions — Phase 11 (D-11-06)
 *
 * Consome GET /api/positions via Eden Treaty + TanStack Query.
 * enabled gate: LiveMap só dispara o fetch quando a camada está ligada.
 * staleTime 60s (D-11-06): re-import é manual, sem refetch agressivo.
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { FleetPosition } from '../../../api/src/modules/positions/positions.service'

export type { FleetPosition }

interface UseFleetPositionsOpts {
  enabled?: boolean
}

export function useFleetPositions(opts?: UseFleetPositionsOpts) {
  const q = useQuery({
    queryKey: ['fleet-positions'],
    staleTime: 60_000,
    enabled: opts?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await api.api.positions.get()
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch fleet positions')
      return (data ?? []) as FleetPosition[]
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
