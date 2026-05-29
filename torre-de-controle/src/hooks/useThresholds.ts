import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/**
 * Alert thresholds hooks — Phase 6, plan 06-06.
 *
 * Wraps api/src/modules/thresholds/thresholds.plugin.ts:
 *   GET   /api/thresholds         (authenticated — read)
 *   PATCH /api/thresholds/:type   (admin only — upsert single value)
 *
 * Response from GET is Record<string, number> e.g.:
 *   { atraso_critico_minutes: 30, desvio_km_threshold: 2, stop_duration_minutes: 15 }
 *
 * Each PATCH invalidates the in-memory 60s cache server-side.
 */
export type Thresholds = Record<string, number>

export function useThresholds() {
  const q = useQuery({
    queryKey: ['thresholds'],
    queryFn:  async () => {
      const { data, error } = await (api.api.thresholds as any).get()
      if (error) {
        const msg = (error.value as any)?.error ?? 'Failed to fetch thresholds'
        throw new Error(msg)
      }
      return (data ?? {}) as Thresholds
    },
  })
  return {
    data:      q.data ?? ({} as Thresholds),
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

export function useUpdateThreshold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ type, value }: { type: string; value: number }) => {
      const { error } = await (api.api.thresholds as any)[type].patch({ value })
      if (error) {
        const msg = (error.value as any)?.error ?? 'Update threshold failed'
        throw new Error(msg)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['thresholds'] }),
  })
}
