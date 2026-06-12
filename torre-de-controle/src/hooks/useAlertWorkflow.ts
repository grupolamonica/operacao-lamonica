import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AlertStatus, Priority } from '@/data/types'

// Server-side treatment record. Used by both the comment thread and the
// status-transition audit log (action_type = 'comment' | 'transition:*' | 'assign').
export type AlertHistoryItem = {
  id:         string
  alertId:    string | null
  tripId:     string | null
  operatorId: string | null
  actionType: string | null
  notes:      string | null
  outcome:    string | null
  createdAt:  string
  authorName: string | null   // quem escreveu (usuário do sistema ou operador do painel)
}

const KEY = (alertId: string) => ['alert-history', alertId]

export function useAlertHistory(alertId: string | null) {
  return useQuery({
    queryKey: KEY(alertId ?? 'none'),
    enabled:  !!alertId,
    queryFn:  async (): Promise<AlertHistoryItem[]> => {
      const { data, error } = await (api.api.alerts as any)[alertId!].history.get()
      if (error) throw new Error('Failed to fetch alert history')
      return data as AlertHistoryItem[]
    },
    staleTime: 10_000,
  })
}

export function useTransitionAlert(alertId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { to: AlertStatus; notes?: string }) => {
      const { data, error } = await (api.api.alerts as any)[alertId].transition.post(vars)
      if (error) throw new Error((error as any)?.value?.error ?? 'Transition failed')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY(alertId) })
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['alert-stats'] })
    },
  })
}

export function useAddAlertComment(alertId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (text: string) => {
      const { data, error } = await (api.api.alerts as any)[alertId].comment.post({ text })
      if (error) throw new Error('Comment failed')
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(alertId) }),
  })
}

export function useSetAlertPriority(alertId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (priority: Priority) => {
      const { data, error } = await (api.api.alerts as any)[alertId].priority.patch({ priority })
      if (error) throw new Error('Priority change failed')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: KEY(alertId) })
    },
  })
}
