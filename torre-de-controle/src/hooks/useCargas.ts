import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Phase 14 — Cargas em aberto + candidatos + alocação (consome /api/cargas/*).
// `as any`: as rotas novas ainda não estão no type App copiado (mesmo padrão de (api.api.trips as any)).

export interface OpenLoad {
  id: string
  lh: string | null
  cliente: string | null
  origem: string | null
  destino: string | null
  perfil: string | null
  valor: number | null
  bonus: number | null
  compensacao: number | null
  status: string
  candidatesCount: number
}

export interface LoadCandidate {
  id: string
  origin: 'lead' | 'claim'
  cpf: string | null
  nome: string | null
  horsePlate: string | null
  trailerPlate: string | null
  vehicleType: string | null
  status: string
}

export interface AllocateInput {
  leadId?: string
  cpf?: string
  phone?: string
  horsePlate?: string
  trailerPlate?: string
  trailerPlate2?: string
  vehicleType?: string
}

export function useOpenLoads() {
  const q = useQuery({
    queryKey: ['cargas', 'open-loads'],
    queryFn: async (): Promise<OpenLoad[]> => {
      const { data, error } = await (api.api as any).cargas['open-loads'].get()
      if (error) throw new Error('Falha ao carregar cargas em aberto')
      return (data ?? []) as OpenLoad[]
    },
    refetchInterval: 30_000,
  })
  return { data: q.data ?? [], isLoading: q.isLoading, isError: q.isError, refetch: q.refetch }
}

export function useLoadCandidates(loadId: string | null) {
  const q = useQuery({
    queryKey: ['cargas', 'candidates', loadId],
    enabled: !!loadId,
    queryFn: async (): Promise<LoadCandidate[]> => {
      const { data, error } = await (api.api as any).cargas['open-loads'][loadId!].candidates.get()
      if (error) throw new Error('Falha ao carregar candidatos')
      return (data ?? []) as LoadCandidate[]
    },
  })
  return { data: q.data ?? [], isLoading: q.isLoading }
}

export interface AvailableDriver {
  name: string
  cpf: string
  phone: string | null
  vinculo: string | null
  horsePlate: string | null
  trailerPlate: string | null
  vehicleType: string | null
  disponivel: true
  fonte: 'torre' | 'planilha'
}

/** Motoristas disponíveis p/ alocação avulsa (sem trip in_progress, fora dos Bloqueados). */
export function useAvailableDrivers(enabled = true) {
  const q = useQuery({
    queryKey: ['cargas', 'available-drivers'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<AvailableDriver[]> => {
      const { data, error } = await (api.api as any).cargas['available-drivers'].get()
      if (error) throw new Error('Falha ao carregar motoristas disponíveis')
      return (data ?? []) as AvailableDriver[]
    },
  })
  return { data: q.data ?? [], isLoading: q.isLoading }
}

export function useAllocateLoad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ loadId, body }: { loadId: string; body: AllocateInput }) => {
      const { data, error } = await (api.api as any).cargas['open-loads'][loadId].allocate.post(body)
      if (error) throw new Error(error?.value?.error ?? 'Falha ao alocar motorista no Cargas')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cargas'] })
    },
  })
}

// --- Cargas ALOCADAS + desalocação (cancela o lead/claim ativo) ---

export interface AllocatedLoad {
  id: string
  lh: string | null
  cliente: string | null
  origem: string | null
  destino: string | null
  perfil: string | null
  status: string
  leadId: string | null
  cpf: string | null
  driverName: string | null
  horsePlate: string | null
  trailerPlate: string | null
}

export function useAllocatedLoads() {
  const q = useQuery({
    queryKey: ['cargas', 'allocated-loads'],
    queryFn: async (): Promise<AllocatedLoad[]> => {
      const { data, error } = await (api.api as any).cargas['allocated-loads'].get()
      if (error) throw new Error('Falha ao carregar cargas alocadas')
      return (data ?? []) as AllocatedLoad[]
    },
    refetchInterval: 30_000,
  })
  return { data: q.data ?? [], isLoading: q.isLoading, isError: q.isError, refetch: q.refetch }
}

export function useDeallocateLoad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ loadId, leadId, claimId }: { loadId: string; leadId?: string; claimId?: string }) => {
      const { data, error } = await (api.api as any).cargas.loads[loadId].deallocate.post({ leadId, claimId })
      if (error) throw new Error(error?.value?.error ?? 'Falha ao desalocar motorista no Cargas')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cargas'] })
    },
  })
}
