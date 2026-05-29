import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/**
 * GPS providers hooks — Phase 6, plan 06-06.
 *
 * Wraps api/src/modules/gps-providers/gps-providers.plugin.ts:
 *   GET    /api/gps-providers       (authenticated — list, apiKey masked)
 *   GET    /api/gps-providers/:id   (authenticated — get one, apiKey masked)
 *   POST   /api/gps-providers       (admin only — create)
 *   PATCH  /api/gps-providers/:id   (admin only — update)
 *   DELETE /api/gps-providers/:id   (admin only — hard delete; OK per D-20 stub)
 *
 * Server returns apiKey masked as `••••last4` — never exposes plaintext (T-06.03-06).
 */
export type GpsProvider = {
  id:        string
  name:      string
  baseUrl:   string | null
  apiKey:    string | null  // masked server-side: ••••last4
  isActive:  boolean
  createdAt: string
}

export type CreateGpsProviderInput = {
  name:      string
  baseUrl?:  string
  apiKey?:   string
  isActive?: boolean
}

export type UpdateGpsProviderInput = Partial<CreateGpsProviderInput>

export function useGpsProviders() {
  const q = useQuery({
    queryKey: ['gps-providers'],
    queryFn:  async () => {
      const { data, error } = await (api.api['gps-providers'] as any).get()
      if (error) {
        const msg = (error.value as any)?.error ?? 'Failed to fetch GPS providers'
        throw new Error(msg)
      }
      return (data ?? []) as GpsProvider[]
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

export function useCreateGpsProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateGpsProviderInput) => {
      const { data, error } = await (api.api['gps-providers'] as any).post(input)
      if (error) {
        const msg = (error.value as any)?.error ?? 'Create failed'
        throw new Error(msg)
      }
      return data as GpsProvider
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gps-providers'] }),
  })
}

export function useUpdateGpsProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateGpsProviderInput }) => {
      const { data, error } = await (api.api['gps-providers'] as any)[id].patch(patch)
      if (error) {
        const msg = (error.value as any)?.error ?? 'Update failed'
        throw new Error(msg)
      }
      return data as GpsProvider
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gps-providers'] }),
  })
}

export function useDeleteGpsProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (api.api['gps-providers'] as any)[id].delete()
      if (error) {
        const msg = (error.value as any)?.error ?? 'Delete failed'
        throw new Error(msg)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gps-providers'] }),
  })
}
