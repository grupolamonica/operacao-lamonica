import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Controle Operacional — dados vêm SÓ da API SPX (asp). Polling ao vivo + override
// de status editável pelo operador.

export const OP_STATUSES = [
  'AGUARDANDO CHEGAR NO CLIENTE',
  'AGUARDANDO CARREGAMENTO',
  'CARREGADO',
  'CTE EM EMISSÃO',
  'CTE ENVIADO',
  'DESCARREGANDO',
  'DESCARREGADO',
  'NO SHOW',
  'CANCELADO',
] as const
export type OpStatus = (typeof OP_STATUSES)[number]

export interface OpViagem {
  lh: string
  tipo: string
  carregamento: string
  descarga: string
  motorista: string
  origem: string
  destino: string
  cavalo: string
  carreta: string
  vinculo: string
  grCavalo: string
  grCarreta: string
  statusBase: string
  statusOperacional: string
  overridden: boolean
  atualizadoEm: string | null
}

export interface OpEvent {
  lh: string
  status_operacional: string
  operador: string | null
  created_at: string
}

export function useOperacionalViagens(opts?: { refetchMs?: number }) {
  const q = useQuery({
    queryKey: ['operacional', 'viagens'],
    queryFn: async (): Promise<OpViagem[]> => {
      const { data, error } = await (api.api as any).operacional.viagens.get()
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao ler viagens SPX')
      return ((data as any)?.viagens ?? []) as OpViagem[]
    },
    refetchInterval: opts?.refetchMs ?? 10_000,
    refetchOnWindowFocus: true,
  })
  return { data: q.data ?? [], isLoading: q.isLoading, isError: q.isError, error: q.error, refetch: q.refetch }
}

export function useMovimentacoes(opts?: { refetchMs?: number }) {
  const q = useQuery({
    queryKey: ['operacional', 'movimentacoes'],
    queryFn: async (): Promise<OpEvent[]> => {
      const { data, error } = await (api.api as any).operacional.movimentacoes.get()
      if (error) throw new Error('Falha ao ler movimentações')
      return ((data as any)?.movimentacoes ?? []) as OpEvent[]
    },
    refetchInterval: opts?.refetchMs ?? 10_000,
  })
  return { data: q.data ?? [] }
}

export function useLhLog(lh: string | null) {
  const q = useQuery({
    queryKey: ['operacional', 'log', lh],
    enabled: !!lh,
    queryFn: async (): Promise<OpEvent[]> => {
      const { data, error } = await (api.api as any).operacional.viagens[lh!].log.get()
      if (error) throw new Error('Falha ao ler log')
      return ((data as any)?.log ?? []) as OpEvent[]
    },
  })
  return { data: q.data ?? [], isLoading: q.isLoading }
}

export function useSetOpStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ lh, status }: { lh: string; status: OpStatus }) => {
      const { data, error } = await (api.api as any).operacional.viagens[lh].status.patch({ status })
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao salvar status')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operacional', 'viagens'] })
      qc.invalidateQueries({ queryKey: ['operacional', 'movimentacoes'] })
    },
  })
}
