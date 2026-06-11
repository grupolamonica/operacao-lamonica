import { useQuery, useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '@/lib/api'

export interface OnlineOperator {
  id: string
  name: string
  role: string
  lastSeenAt: string | null
  ticketsAtivos: number
}

export interface OperatorTicket {
  id: string
  type: string
  severity: string
  status: string
  title: string
  occurredAt: string
  lh: string
  motorista: string
  cliente: string
}

/** Tickets ativos que um operador está tratando — usado ao clicar no operador na fila. */
export function useOperatorTickets(operatorId: string | null) {
  const q = useQuery({
    queryKey: ['operator-tickets', operatorId],
    enabled: !!operatorId,
    refetchInterval: 20_000,
    queryFn: async (): Promise<OperatorTicket[]> => {
      const { data, error } = await (api.api as any).operators[operatorId!].tickets.get()
      if (error) throw new Error('Falha ao buscar tickets do operador')
      return (data ?? []) as OperatorTicket[]
    },
  })
  return { data: q.data ?? [], isLoading: q.isLoading }
}

/**
 * Presença de operador (Phase 12 — Fila de Operadores).
 * Envia heartbeat ao montar + a cada 30s, e busca a lista de operadores online
 * (refresh 20s). Porte da "Fila de Operadores" do painel GAS, com presença real.
 */
export function useOperatorPresence() {
  const beat = useMutation({
    mutationFn: async () => {
      await (api.api as any).operators.heartbeat.post()
    },
  })

  useEffect(() => {
    beat.mutate()
    const id = setInterval(() => beat.mutate(), 30_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = useQuery({
    queryKey: ['operators-online'],
    queryFn: async () => {
      const { data, error } = await (api.api as any).operators.online.get()
      if (error) throw new Error('Falha ao buscar operadores online')
      return (data ?? []) as OnlineOperator[]
    },
    refetchInterval: 20_000,
  })

  return { online: q.data ?? [], isLoading: q.isLoading }
}
