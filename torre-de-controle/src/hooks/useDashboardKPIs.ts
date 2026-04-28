import { kpisDashboard, kpisTorre, kpisViagens, kpisMotoristas, kpisAlertas } from '@/data/mocks'
import type { KPIDashboard, KPITorre, KPIViagens, KPIMotoristas, KPIAlertas } from '@/data/types'

export function useDashboardKPIs(): { data: KPIDashboard; isLoading: false; isError: false; error: null; refetch: () => void } {
  return { data: kpisDashboard, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useTorreKPIs(): { data: KPITorre; isLoading: false; isError: false; error: null; refetch: () => void } {
  return { data: kpisTorre, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useViagensKPIs(): { data: KPIViagens; isLoading: false; isError: false; error: null; refetch: () => void } {
  return { data: kpisViagens, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useMotoristasKPIs(): { data: KPIMotoristas; isLoading: false; isError: false; error: null; refetch: () => void } {
  return { data: kpisMotoristas, isLoading: false, isError: false, error: null, refetch: () => {} }
}

export function useAlertasKPIs(): { data: KPIAlertas; isLoading: false; isError: false; error: null; refetch: () => void } {
  return { data: kpisAlertas, isLoading: false, isError: false, error: null, refetch: () => {} }
}
