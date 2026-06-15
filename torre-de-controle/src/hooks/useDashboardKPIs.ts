import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { type PrazoRange, rangeQuery } from '@/components/domain/PrazoFinalFilter'
import type { KPIDashboard, KPITorre, KPIViagens, KPIMotoristas, KPIAlertas } from '@/data/types'

// Phase 13 — dashboard com paridade painel; default zerado p/ estado inicial/erro.
const EMPTY_DASHBOARD: KPIDashboard = {
  filtroSla: '', total: 0, concluidas: 0, noPrazo: 0, atrasadas: 0, aferidas: 0,
  pctNoPrazo: 100, alertas: 0, ticketsPendentes: 0, motoristasEmRisco: 0, meta: 95,
}
const EMPTY_TORRE: KPITorre = {
  viagemAtrasada:     { count: 0 },
  veiculoParado:      { count: 0 },
  viagemNoPrazo:      { count: 0 },
  viagensAtivas:      { count: 0, total: 0 },
  ocorrenciasAbertas: { count: 0 },
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

export function useDashboardKPIs(range: PrazoRange) {
  const q = useQuery({
    queryKey: ['dashboard-kpis', range.inicio, range.fim],
    queryFn: async () => {
      const { data, error } = await api.api.dashboard.kpis.get({ query: rangeQuery(range) })
      if (error) throw error
      return (data ?? EMPTY_DASHBOARD) as KPIDashboard
    },
    refetchInterval: 5_000,         // 5s — operador sente o sistema atualizando em tempo real (como o painel)
    refetchOnWindowFocus: true,
  })
  return { data: q.data ?? EMPTY_DASHBOARD, isLoading: q.isLoading, isError: q.isError, error: q.error, refetch: q.refetch }
}

// Torre KPIs — Phase 12: backend real /api/torre/kpis (D-12-34). Prazo Final "filtra tudo".
export function useTorreKPIs(range: PrazoRange) {
  const q = useQuery({
    queryKey: ['torre-kpis', range.inicio, range.fim],
    queryFn: async () => {
      const { data, error } = await api.api.torre.kpis.get({ query: rangeQuery(range) })
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
