import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Alocação de motorista em VIAGEM SPX (linehaul) — consome /api/allocacao/*.
// Caminho distinto do Cargas (useCargas): aqui atribui motorista+veículo direto
// na viagem do aspx via sidecar (POST /trip/assign). `as any`: rotas novas não
// estão no type App copiado (mesmo padrão de useCargas).

export const SPX_STATION_ID = 5015 // estação do operador (LAMONICA)

export interface AssignableTrip {
  id: string // = String(trip_id); exigido pelo DataTable (key de linha)
  trip_id: number
  trip_number: string
  origem: string | null
  destino: string | null
  vehicle_type: string
  std: number | null
}

export interface SpxAssignableDriver {
  driver_id: number
  name: string
  vehicle_type?: number
  station_id?: number
}

export function useAssignableTrips() {
  const q = useQuery({
    queryKey: ['alocacao-spx', 'trips'],
    queryFn: async (): Promise<AssignableTrip[]> => {
      const { data, error } = await (api.api as any).allocacao.trips.open.get({ query: { station_id: String(SPX_STATION_ID) } })
      if (error || !data?.ok) throw new Error(data?.error ?? 'Falha ao carregar viagens atribuíveis')
      return ((data.trips ?? []) as Omit<AssignableTrip, 'id'>[]).map((t) => ({ ...t, id: String(t.trip_id) }))
    },
    refetchInterval: 30_000,
  })
  return { data: q.data ?? [], isLoading: q.isLoading, isError: q.isError, refetch: q.refetch }
}

export function useAssignableDrivers(enabled = true) {
  const q = useQuery({
    queryKey: ['alocacao-spx', 'drivers'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<SpxAssignableDriver[]> => {
      const { data, error } = await (api.api as any).allocacao.drivers.assignable.get()
      if (error || !data?.ok) throw new Error(data?.error ?? 'Falha ao carregar motoristas atribuíveis')
      return (data.drivers ?? []) as SpxAssignableDriver[]
    },
  })
  return { data: q.data ?? [], isLoading: q.isLoading }
}

export interface AssignTripInput {
  tripId: number
  driverIds: number[]
  vehiclePlates: string[] // [cavalo, carreta]
}

export interface AssignTripResult {
  ok: boolean
  writeEnabled: boolean
  forcedDryRun: boolean
  dry_run: boolean
  enviado_ao_aspx: boolean
  steps: Array<{ etapa: string; method?: string; path?: string; body?: unknown }>
}

export function useAssignTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ tripId, driverIds, vehiclePlates }: AssignTripInput): Promise<AssignTripResult> => {
      const { data, error } = await (api.api as any).allocacao.trips[String(tripId)].assign.post({
        driver_ids: driverIds,
        vehicle_plates: vehiclePlates,
        station_id: SPX_STATION_ID,
        dry_run: false, // pede envio real; o backend só envia se SPX_ALLOC_WRITE_ENABLED ligado
      })
      if (error) throw new Error(error?.value?.error ?? 'Falha ao alocar na viagem SPX')
      if (data && data.ok === false) throw new Error(data.error ?? 'Falha ao alocar na viagem SPX')
      return data as AssignTripResult
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alocacao-spx'] })
    },
  })
}
