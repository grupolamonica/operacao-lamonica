import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type Geofence = {
  id:          string
  name:        string
  type:        'zona_restrita' | 'zona_perigo' | 'zona_operacao' | 'checkpoint'
  color:       string
  coordinates: number[][][]
  isActive:    boolean
  description: string | null
  createdAt:   string
  updatedAt:   string
}

export function useGeofences() {
  const q = useQuery({
    queryKey: ['geofences'],
    queryFn:  async () => {
      const { data, error } = await api.api.geofences.get()
      if (error) throw new Error('Failed to fetch geofences')
      return (data ?? []) as unknown as Geofence[]
    },
  })
  return { data: q.data ?? [], isLoading: q.isLoading, refetch: q.refetch }
}

export function useCreateGeofence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; type?: string; color?: string; coordinates: number[][][]; description?: string }) => {
      const { data, error } = await (api.api.geofences as any).post(body)
      if (error) throw new Error('Create failed')
      return data as Geofence
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['geofences'] }),
  })
}

export function useDeleteGeofence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await (api.api.geofences as any)[id].delete()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['geofences'] }),
  })
}
