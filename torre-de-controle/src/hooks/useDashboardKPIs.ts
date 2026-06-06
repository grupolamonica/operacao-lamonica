import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { KPIDashboard, KPITorre, KPIViagens, KPIMotoristas, KPIAlertas, PeriodoSla } from '@/data/types'

// Phase 13 — dashboard com paridade painel; default zerado p/ estado inicial/erro.
const EMPTY_DASHBOARD: KPIDashboard = {
  filtroSla: '30d', total: 0, concluidas: 0, noPrazo: 0, atrasadas: 0, aferidas: 0,
  pctNoPrazo: 100, alertas: 0, ticketsPendentes: 0, motoristasEmRisco: 0, meta: 95,
}
const EMPTY_TORRE: KPITorre = {
  viagensAtivas:   { count: 0, total: 0 },
  emRisco:         { count: 0, total: 0 },
  atrasosCriticos: { count: 0, total: 0 },
  semSinal:        { count: 0, total: 0 },
  ocorrencias:     { criticas: 0, medias: 0 },
}
const EMPTY_VIAGENS: KPIViagens = {
  total: { count: 0 }, noPrazo: { count: 0, pct: 0 }, emRisco: { count: 0, pct: 0 },
  atrasadas: { count: 0, pct: 0 }, progressoMedio: { pct: 0 },
}
const EMPTY_MOTORISTAS: KPIMotoristas = {
  ativos: { count: 0, total: 0 }, disponiveis: { count: 0 }, emRota: { count: 0 },
  comAtraso: { count: 0 }, documentosVencendo: { count: 0 },
}
const EMPTY_ALERTAS: KPIAlertas = {
  criticos: { count: 0 }, abertos: { count: 0 }, resolvidosHoje: { count: 0 }, slaTratativas: { pct: 100 },
}

export function useDashboardKPIs(periodo: PeriodoSla = '30d') {
  const q = useQuery({
    queryKey: ['dashboard-kpis', periodo],
    queryFn: async () => {
      const { data, error } = await api.api.dashboard.kpis.get({ query: { periodo } })
      if (error) throw error
      return (data ?? EMPTY_DASHBOARD) as KPIDashboard
    },
    refetchInterval: 30_000,
  })
  return { data: q.data ?? EMPTY_DASHBOARD, isLoading: q.isLoading, isError: q.isError, error: q.error, refetch: q.refetch }
}

// Torre KPIs — Phase 12: backend real /api/torre/kpis (D-12-34).
export function useTorreKPIs() {
  const q = useQuery({
    queryKey: ['torre-kpis'],
    queryFn: async () => {
      const { data, error } = await api.api.torre.kpis.get()
      if (error) throw error
      return (data ?? EMPTY_TORRE) as KPITorre
    },
    refetchInterval: 30_000,
  })
  return { data: q.data ?? EMPTY_TORRE, isLoading: q.isLoading, isError: q.isError, error: q.error, refetch: q.refetch }
}

export function useViagensKPIs() {
  const q = useQuery({
    queryKey: ['trips-kpis'],
    queryFn: async () => {
      const { data, error } = await api.api.trips.stats.get()
      if (error) throw error
      return (data ?? EMPTY_VIAGENS) as KPIViagens
    },
    refetchInterval: 30_000,
  })
  return { data: q.data ?? EMPTY_VIAGENS, isLoading: q.isLoading, isError: q.isError, error: q.error, refetch: q.refetch }
}

export function useMotoristasKPIs() {
  const q = useQuery({
    queryKey: ['drivers-kpis'],
    queryFn: async () => {
      const { data, error } = await api.api.drivers.stats.get()
      if (error) throw error
      return (data ?? EMPTY_MOTORISTAS) as KPIMotoristas
    },
    refetchInterval: 30_000,
  })
  return { data: q.data ?? EMPTY_MOTORISTAS, isLoading: q.isLoading, isError: q.isError, error: q.error, refetch: q.refetch }
}

export function useAlertasKPIs() {
  const q = useQuery({
    queryKey: ['alerts-kpis'],
    queryFn: async () => {
      const { data, error } = await api.api.alerts.stats.get()
      if (error) throw error
      return (data ?? EMPTY_ALERTAS) as KPIAlertas
    },
    refetchInterval: 30_000,
  })
  return { data: q.data ?? EMPTY_ALERTAS, isLoading: q.isLoading, isError: q.isError, error: q.error, refetch: q.refetch }
}
