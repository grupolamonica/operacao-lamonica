import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { kpisDashboard, kpisTorre, kpisViagens, kpisMotoristas, kpisAlertas } from '@/data/mocks'
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

// Torre KPIs — served from the mock for now (no dedicated backend endpoint yet)
export function useTorreKPIs() {
  return { data: kpisTorre as KPITorre, isLoading: false as const, isError: false as const, error: null, refetch: () => {} }
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
