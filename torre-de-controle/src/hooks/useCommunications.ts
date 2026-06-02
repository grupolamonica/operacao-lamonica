import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type Channel   = 'call' | 'sms' | 'whatsapp' | 'note'
export type Direction = 'out'  | 'in'
export type Outcome   = 'atendida' | 'nao_atendida' | 'caixa_postal' | 'enviada' | 'recebida'

export interface Communication {
  id:          string
  driverId:    string | null
  tripId:      string | null
  alertId:     string | null
  operatorId:  string | null
  channel:     Channel
  direction:   Direction
  content:     string | null
  durationSec: number | null
  outcome:     Outcome | null
  occurredAt:  string
  createdAt:   string
}

export interface CommScope { driverId?: string | null; tripId?: string | null; alertId?: string | null }

const KEY = (s: CommScope) => ['communications', s.driverId ?? null, s.tripId ?? null, s.alertId ?? null]

export function useCommunications(scope: CommScope) {
  const enabled = !!(scope.driverId || scope.tripId || scope.alertId)
  return useQuery({
    queryKey: KEY(scope),
    enabled,
    queryFn: async (): Promise<Communication[]> => {
      const query: Record<string, string> = {}
      if (scope.driverId) query.driverId = scope.driverId
      if (scope.tripId)   query.tripId   = scope.tripId
      if (scope.alertId)  query.alertId  = scope.alertId
      const { data, error } = await (api.api.communications as any).get({ query })
      if (error) throw new Error('Failed to load communications')
      return data as Communication[]
    },
    staleTime: 20_000,
  })
}

export function useLogCommunication(scope: CommScope) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      channel:      Channel
      direction?:   Direction
      content?:     string
      durationSec?: number
      outcome?:     Outcome
    }) => {
      const body = {
        driverId: scope.driverId ?? undefined,
        tripId:   scope.tripId   ?? undefined,
        alertId:  scope.alertId  ?? undefined,
        ...payload,
      }
      const { data, error } = await (api.api.communications as any).post(body)
      if (error) throw new Error('Failed to log communication')
      return data as Communication
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY(scope) })
      // Cascade: a comm logged for a trip should also refresh views scoped by driver/alert if any
      qc.invalidateQueries({ queryKey: ['communications'] })
    },
  })
}
