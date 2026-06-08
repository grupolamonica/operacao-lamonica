import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Driver, DriverFilters } from '@/data/types'

export function useDrivers(filters?: DriverFilters) {
  const q = useQuery({
    queryKey: ['drivers', filters],
    queryFn: async () => {
      const { data, error } = await api.api.drivers.get({ query: (filters ?? {}) as any })
      if (error) throw new Error((error.value as any)?.error ?? 'Failed to fetch drivers')
      return (data ?? []) as Driver[]
    },
  })
  return {
    data:      q.data ?? [],
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}

export interface DriverDossie {
  identidade: {
    id: string; code: string; name: string
    cpf: string | null; rg: string | null
    cnh: string | null; cnhCategoria: string | null; cnhValidade: string | null
    nascimento: string | null; driverKind: string | null
    cidade: string | null; estado: string | null
    phone: string | null; email: string | null; shopeeDriverId: string | null
  }
  conformidade: {
    status: string; operationalScore: number
    angelliraStatus: string | null; angelliraValidUntil: string | null
    anttValid: boolean | null; documentsValid: boolean | null; insuranceValid: boolean | null
    trackingEnabled: boolean | null; operationalBlocked: boolean | null
  }
  viagens: {
    total: number; completas: number; canceladas: number; emAndamento: number
    noPrazo: number; atrasadas: number; pctNoPrazo: number | null; qtdLh: number
    primeira: string | null; ultima: string | null
    avgRanking: number | null; totalValor: number
    recentes: Array<{
      code: string; origin: string; destination: string; status: string; slaStatus: string | null
      windowStart: string | null; eta: string | null; valor: number | null
      rankingScore: number | null; sheetLh: string | null; cavalo: string | null; carreta: string | null
    }>
  }
  veiculos: Array<{
    plate: string; type: string | null; model: string | null; plateRole: string | null
    angelliraStatus: string | null; angelliraValidUntil: string | null
  }>
  documentos: Array<{
    type: string; status: string; expiresAt: string | null; issuedAt: string | null
  }>
  localizacao: {
    address: string | null; lat: number | null; lng: number | null
    ultimaPosicao: { at: string | null; cidade: string | null; uf: string | null; veiculo: string | null } | null
  }
  ocorrencias: Array<{
    type: string; severity: string; status: string; title: string
    occurredAt: string | null; resolvedAt: string | null
  }>
}

export function useDriverDossie(id: string | null) {
  const q = useQuery({
    queryKey: ['driver-dossie', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (api.api.drivers as any)[id!].dossie.get()
      if (error) throw new Error((error.value as any)?.error ?? 'Not found')
      return (data ?? null) as DriverDossie | null
    },
  })
  return { data: q.data ?? null, isLoading: q.isLoading, isError: q.isError, error: q.error }
}

/** Dossiê pelo NOME do motorista — usado quando a viagem (painel) não tem driverId. */
export function useDriverDossieByName(name: string | null) {
  const q = useQuery({
    queryKey: ['driver-dossie-name', name],
    enabled: !!name,
    queryFn: async () => {
      const { data, error } = await (api.api.drivers as any).dossie['by-name'].get({ query: { name: name! } })
      if (error) return null
      return (data ?? null) as DriverDossie | null
    },
  })
  return { data: q.data ?? null, isLoading: q.isLoading }
}

export function useDriver(id: string | null) {
  const q = useQuery({
    queryKey: ['driver', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (api.api.drivers as any)[id!].get()
      if (error) throw new Error((error.value as any)?.error ?? 'Not found')
      return (data ?? null) as Driver | null
    },
  })
  return {
    data:      q.data ?? null,
    isLoading: q.isLoading,
    isError:   q.isError,
    error:     q.error,
    refetch:   q.refetch,
  }
}
