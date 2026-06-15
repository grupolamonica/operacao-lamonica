import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { RiskSnapshot } from '@/data/types'
import type { MotoristaDossie, VeiculoDossie } from './useTripDossie'

// GET /api/trips/:id/360 — UM envelope com tudo cruzado (viagem + motorista[ranking/
// pessoal/vínculo] + carga + cavalo/carreta + risco + GPS + timeline). Cacheado 20s
// no servidor; o front faz polling de 12s pra manter a viagem aberta sempre fresca
// sem re-rodar os joins pesados (eles batem no cache).

export interface Gps360 { lat: number; lng: number; cidade: string | null; uf: string | null; veiculo: string | null; at: string }
export interface TrackPoint360 { lat: number; lng: number; ts: string }

export interface Viagem360 {
  viagem: Record<string, unknown> | null
  motorista: MotoristaDossie | null
  carga: Record<string, unknown> | null
  cavalo: VeiculoDossie | null
  carreta: VeiculoDossie | null
  risco: RiskSnapshot | null
  gps: Gps360 | null
  // Trajeto da viagem já recortado à sua janela no servidor (só esta viagem).
  track: TrackPoint360[]
  timeline: unknown[]
  geradoEm: string
}

export function useViagem360(tripId: string | null) {
  const q = useQuery({
    queryKey: ['viagem360', tripId],
    enabled: !!tripId,
    staleTime: 12_000,
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<Viagem360 | null> => {
      const { data, error } = await (api.api.trips as any)[tripId!]['360'].get()
      if (error) return null
      return (data ?? null) as Viagem360 | null
    },
  })
  return { data: q.data ?? null }
}
