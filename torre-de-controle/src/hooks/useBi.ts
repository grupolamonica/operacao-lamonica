import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { type PrazoRange, rangeQuery } from '@/components/domain/PrazoFinalFilter'

export type BiDimension = 'client' | 'driver' | 'region' | 'route'
export type BiMetric    = 'deliveries' | 'sla_pct' | 'alerts' | 'delay_avg'

export interface BiKpis {
  period: string   // eco do intervalo Prazo Final ("inicio..fim")
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

interface Filters { range: PrazoRange; clientId?: string | null }

export function useBiKpis(filters: Filters) {
  return useQuery({
    queryKey: ['bi-kpis', filters.range.inicio, filters.range.fim, filters.clientId ?? null],
    queryFn: async (): Promise<BiKpis> => {
      const query: Record<string, string> = { ...rangeQuery(filters.range) }
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
    queryKey: ['bi-breakdown', filters.dimension, filters.range.inicio, filters.range.fim, filters.clientId ?? null],
    queryFn: async (): Promise<BiBreakdownRow[]> => {
      const query: Record<string, string> = { dimension: filters.dimension, ...rangeQuery(filters.range) }
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
    queryKey: ['bi-trend', filters.metric, filters.range.inicio, filters.range.fim, filters.clientId ?? null],
    queryFn: async (): Promise<BiTrendPoint[]> => {
      const query: Record<string, string> = { metric: filters.metric, ...rangeQuery(filters.range) }
      if (filters.clientId) query.clientId = filters.clientId
      const { data, error } = await (api.api.bi as any).trend.get({ query })
      if (error) throw new Error('Failed to load BI trend')
      return data as BiTrendPoint[]
    },
    staleTime: 30_000,
  })
}
