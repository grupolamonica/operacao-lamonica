import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { type PrazoRange, rangeQuery } from '@/components/domain/PrazoFinalFilter'

export interface SeriesPoint { date: string; value: number }
export interface ForecastPoint extends SeriesPoint { forecast: true; lower: number; upper: number }

export interface DemandForecast {
  history:    SeriesPoint[]
  forecast:   ForecastPoint[]
  total7d:    number
  trend:      'up' | 'down' | 'flat'
  breakdown?: Array<{ key: string; label: string; total7d: number; share: number }>
}

export interface RegionRisk {
  key:               string
  label:             string
  trips7d:           number
  riskScore:         number
  currentRiskShare:  number
}

export interface DelayRiskForecast {
  next24h:    { expectedTrips: number; expectedBreaches: number; breachPct: number }
  historical: { breachPctLastWeek: number }
}

export function useForecastDemand(horizon = 7, dimension: 'total' | 'client' | 'region' = 'total', range: PrazoRange = { inicio: null, fim: null }) {
  return useQuery({
    queryKey: ['forecast-demand', horizon, dimension, range.inicio, range.fim],
    queryFn: async (): Promise<DemandForecast> => {
      const { data, error } = await (api.api.forecast as any).demand.get({ query: { horizon, dimension, ...rangeQuery(range) } })
      if (error) throw new Error('Failed to load demand forecast')
      return data as DemandForecast
    },
    refetchInterval: 5 * 60_000,
    staleTime:       2 * 60_000,
  })
}

export function useForecastRegions() {
  return useQuery({
    queryKey: ['forecast-regions'],
    queryFn: async (): Promise<RegionRisk[]> => {
      const { data, error } = await (api.api.forecast as any).regions.get()
      if (error) throw new Error('Failed to load region forecast')
      return data as RegionRisk[]
    },
    refetchInterval: 5 * 60_000,
    staleTime:       2 * 60_000,
  })
}

export function useForecastDelayRisk() {
  return useQuery({
    queryKey: ['forecast-delay-risk'],
    queryFn: async (): Promise<DelayRiskForecast> => {
      const { data, error } = await (api.api.forecast as any)['delay-risk'].get()
      if (error) throw new Error('Failed to load delay risk')
      return data as DelayRiskForecast
    },
    refetchInterval: 5 * 60_000,
    staleTime:       2 * 60_000,
  })
}
