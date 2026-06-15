import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Feed de auditoria das ações dos operadores (GET /api/audit, admin-only).
// Mesma mecânica do useAlerts: react-query + filtros como query params.

export type AuditCategory = 'nota' | 'tratativa' | 'comunicacao' | 'status_operacional'

export interface AuditItem {
  id:           string
  category:     AuditCategory
  action:       string
  operatorId:   string | null
  operatorName: string
  target:       string | null
  detail:       string | null
  occurredAt:   string
  severity:     string | null
}

export interface AuditFilters {
  inicio?:     string
  fim?:        string
  operatorId?: string
  category?:   AuditCategory
}

export function useAuditLog(filters?: AuditFilters) {
  const q = useQuery({
    queryKey: ['audit', filters],
    queryFn: async () => {
      const { data, error } = await (api.api as any).audit.get({ query: (filters ?? {}) as any })
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao carregar a auditoria')
      return (data ?? []) as AuditItem[]
    },
    staleTime: 30_000,
  })
  return { data: q.data ?? [], isLoading: q.isLoading, isError: q.isError, error: q.error }
}
