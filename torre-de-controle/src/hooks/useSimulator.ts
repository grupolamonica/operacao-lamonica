import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface SimRequest {
  origin:       { lat: number; lng: number }
  destination:  { lat: number; lng: number }
  vehicleType?: 'Van' | 'Furgão' | 'VUC' | null
}

export interface RouteAlternative {
  routeId:        string | null
  routeCode:      string
  routeName:      string
  sampleCount:    number
  distanceKm:     number
  durationMin:    number
  slaPct:         number
  riskAvg:        number
  alertsPerTrip:  number
  tollEstBRL:     number
  score:          number
  isFastest:      boolean
  isCheapest:     boolean
  isMostReliable: boolean
}

export interface SimResponse {
  theoreticalMinKm: number
  alternatives:     RouteAlternative[]
  noHistoryMatch:   boolean
}

export function useSimulateRoutes() {
  return useMutation({
    mutationFn: async (req: SimRequest): Promise<SimResponse> => {
      const { data, error } = await (api.api.simulator as any).routes.post(req)
      if (error) throw new Error('Failed to simulate routes')
      return data as SimResponse
    },
  })
}
