import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type HeatmapLayer  = 'alertas' | 'atrasos' | 'desvios' | 'paradas' | 'risco'
export type HeatmapPeriod = 'today' | '7d' | '30d'

export interface HeatmapPoint { lat: number; lng: number; weight: number }
export interface HeatmapPayload {
  layer:  HeatmapLayer
  period: HeatmapPeriod
  count:  number
  bounds: [[number, number], [number, number]] | null
  points: HeatmapPoint[]
}

export function useHeatmap(layer: HeatmapLayer, period: HeatmapPeriod) {
  return useQuery({
    queryKey: ['heatmap', layer, period],
    queryFn: async (): Promise<HeatmapPayload> => {
      const { data, error } = await (api.api.heatmap as any).get({ query: { layer, period } })
      if (error) throw new Error('Failed to load heatmap')
      return data as HeatmapPayload
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}
