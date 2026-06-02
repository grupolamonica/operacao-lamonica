import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type BiPeriod    = 'today' | '7d' | '30d' | '90d'
export type BiDimension = 'client' | 'driver' | 'region' | 'route'
export type BiMetric    = 'deliveries' | 'sla_pct' | 'alerts' | 'delay_avg'

export interface BiKpis {
  period: BiPeriod
  deliveries: { total: number; completed: number; onTimePct: number }
  sla:        { pct: number; onTime: number; closed: number }
  alerts:     { open: number; critical: number; createdInWindow: number }
  delayAvg:   { minutes: number }
  risk:       { critico: number; alto: number; medio: number; baixo: number }
}

export interface BiBreakdownRow {
  key:          string
  label:        string
  deliveries:   number
  completed:    number
  onTime:       number
  slaPct:       number
  alertsCount:  number
  delayAvgMin:  number
}

export interface BiTrendPoint { date: string; value: number }

interface Filters { period: BiPeriod; clientId?: string | null }

export function useBiKpis(filters: Filters) {
  return useQuery({
    queryKey: ['bi-kpis', filters.period, filters.clientId ?? null],
    queryFn: async (): Promise<BiKpis> => {
      const query: Record<string, string> = { period: filters.period }
      if (filters.clientId) query.clientId = filters.clientId
      const { data, error } = await (api.api.bi as any).kpis.get({ query })
      if (error) throw new Error('Failed to load BI KPIs')
      return data as BiKpis
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

export function useBiBreakdown(filters: Filters & { dimension: BiDimension }) {
  return useQuery({
    queryKey: ['bi-breakdown', filters.dimension, filters.period, filters.clientId ?? null],
    queryFn: async (): Promise<BiBreakdownRow[]> => {
      const query: Record<string, string> = { dimension: filters.dimension, period: filters.period }
      if (filters.clientId) query.clientId = filters.clientId
      const { data, error } = await (api.api.bi as any).breakdown.get({ query })
      if (error) throw new Error('Failed to load BI breakdown')
      return data as BiBreakdownRow[]
    },
    staleTime: 30_000,
  })
}

export function useBiTrend(filters: Filters & { metric: BiMetric }) {
  return useQuery({
    queryKey: ['bi-trend', filters.metric, filters.period, filters.clientId ?? null],
    queryFn: async (): Promise<BiTrendPoint[]> => {
      const query: Record<string, string> = { metric: filters.metric, period: filters.period }
      if (filters.clientId) query.clientId = filters.clientId
      const { data, error } = await (api.api.bi as any).trend.get({ query })
      if (error) throw new Error('Failed to load BI trend')
      return data as BiTrendPoint[]
    },
    staleTime: 30_000,
  })
}
