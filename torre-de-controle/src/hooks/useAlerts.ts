import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '@/lib/api'
import type { Alert, AlertFilters } from '@/data/types'

export function useAlerts(filters?: AlertFilters) {
  const q = useQuery({
    queryKey: ['alerts', filters],
    queryFn: async () => {
      const { data, error } = await api.api.alerts.get({ query: (filters ?? {}) as any })
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch alerts')
      return (data ?? []) as Alert[]
    },
    // Ocorrências atualiza sozinha (20s) — sem precisar do botão. Pausa com a aba oculta
    // (refetchIntervalInBackground:false no QueryClient) e revalida ao focar a aba.
    refetchInterval: 20_000,
  })
  return {
    data:      q.data ?? [],
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

export function useAlert(id: string | null) {
  const { data: all } = useAlerts()
  // Caminho rápido: já está na lista (500 recentes) → abre na hora, sem rede.
  const inList = useMemo(() => (id ? all.find(a => a.id === id) ?? null : null), [id, all])
  // Fallback p/ deep-link (auditoria/sino/dashboard): ticket fora dos 500 recentes
  // (antigo/resolvido) → busca a ocorrência por id no servidor (GET /api/alerts/:id).
  const q = useQuery({
    queryKey: ['alert', id],
    enabled: !!id && !inList,
    queryFn: async () => {
      const { data, error } = await (api.api.alerts as any)[id!].get()
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch alert')
      return data as Alert
    },
  })
  return {
    data:      inList ?? q.data ?? null,
    isLoading: !inList && q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

export function useAlertsBySeverity() {
  const { data } = useAlerts()
  return useMemo(() => ({
    critico: data.filter(a => a.severity === 'critico'),
    medio:   data.filter(a => a.severity === 'medio'),
    baixo:   data.filter(a => a.severity === 'baixo'),
  }), [data])
}
