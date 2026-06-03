import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { kpisDashboard, kpisViagens, kpisMotoristas, kpisAlertas } from '@/data/mocks'
import type { KPIDashboard, KPITorre, KPIViagens, KPIMotoristas, KPIAlertas } from '@/data/types'

export function useDashboardKPIs() {
  const q = useQuery({
    queryKey: ['dashboard-kpis'],
    queryFn: async () => {
      const { data, error } = await api.api.dashboard.kpis.get()
      if (error) return kpisDashboard
      return (data ?? kpisDashboard) as KPIDashboard
    },
    refetchInterval: 30_000,
  })
  return {
    data:      q.data ?? kpisDashboard,
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

// Torre KPIs — Phase 12: served by real backend /api/torre/kpis (D-12-34).
const EMPTY_TORRE: KPITorre = {
  viagensAtivas:   { count: 0, total: 0 },
  emRisco:         { count: 0, total: 0 },
  atrasosCriticos: { count: 0, total: 0 },
  semSinal:        { count: 0, total: 0 },
  ocorrencias:     { criticas: 0, medias: 0 },
}
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
  return {
    data:      q.data ?? EMPTY_TORRE,
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

export function useViagensKPIs() {
  const q = useQuery({
    queryKey: ['trips-kpis'],
    queryFn: async () => {
      const { data, error } = await api.api.trips.stats.get()
      if (error) return kpisViagens
      return (data ?? kpisViagens) as KPIViagens
    },
    refetchInterval: 30_000,
  })
  return {
    data:      q.data ?? kpisViagens,
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

export function useMotoristasKPIs() {
  const q = useQuery({
    queryKey: ['drivers-kpis'],
    queryFn: async () => {
      const { data, error } = await api.api.drivers.stats.get()
      if (error) return kpisMotoristas
      return (data ?? kpisMotoristas) as KPIMotoristas
    },
    refetchInterval: 30_000,
  })
  return {
    data:      q.data ?? kpisMotoristas,
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

export function useAlertasKPIs() {
  const q = useQuery({
    queryKey: ['alerts-kpis'],
    queryFn: async () => {
      const { data, error } = await api.api.alerts.stats.get()
      if (error) return kpisAlertas
      return (data ?? kpisAlertas) as KPIAlertas
    },
    refetchInterval: 30_000,
  })
  return {
    data:      q.data ?? kpisAlertas,
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}
