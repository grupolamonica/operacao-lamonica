import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Phase 14 — trajeto histórico de um motorista (GET /api/positions/track?motorista=).
// `as any`: rota nova ainda não está no type App copiado.

export interface TrackPoint {
  lat: number
  lng: number
  ts: string
}

export function useDriverTrack(motorista: string | null) {
  const q = useQuery({
    queryKey: ['driver-track', motorista],
    enabled: !!motorista,
    queryFn: async (): Promise<TrackPoint[]> => {
      const { data, error } = await (api.api as any).positions.track.get({ query: { motorista } })
      if (error) throw new Error('Falha ao carregar trajeto do motorista')
      return (data ?? []) as TrackPoint[]
    },
    staleTime: 30_000,
  })
  return { data: q.data ?? [], isLoading: q.isLoading }
}
