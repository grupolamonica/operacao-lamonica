import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Phase 14 — dossiê cruzado da viagem (GET /api/trips/:id/dossie): carga completa +
// motorista + cavalo + carreta com TUDO das 3 bases (torre + ranking + cargas).

export interface VeiculoDossie {
  placa: string | null
  papel: 'cavalo' | 'carreta'
  tipo: string | null
  marca: string | null
  modelo: string | null
  marcaModelo: string | null
  chassi: string | null
  renavam: string | null
  anoFab: number | null
  anoModelo: number | null
  cor: string | null
  antt: string | null
  classificacao: string | null
  ultimoLicenciamento: string | null
  angellira: string | null
  vigenteAte: string | null
}

export interface MotoristaDossie {
  nome: string
  cpf: string | null
  rg: string | null
  cnh: string | null
  cnhCategoria: string | null
  cnhValidade: string | null
  nascimento: string | null
  vinculo: string | null
  cidade: string | null
  estado: string | null
  cidadeUf: string | null
  telefone: string | null
  email: string | null
  score: number | null
  bloqueado: boolean | null
  angellira: string | null
  vigenteAte: string | null
  rankPosicao: number | null
  rankPontuacao: number | null
  cargas: Record<string, unknown> | null
}

export interface TripDossie {
  lh: string | null
  carga: Record<string, unknown> | null
  motorista: MotoristaDossie | null
  cavalo: VeiculoDossie | null
  carreta: VeiculoDossie | null
}

export function useTripDossie(tripId: string | null) {
  const q = useQuery({
    queryKey: ['trip-dossie', tripId],
    enabled: !!tripId,
    staleTime: 60_000,
    queryFn: async (): Promise<TripDossie | null> => {
      const { data, error } = await (api.api.trips as any)[tripId!].dossie.get()
      if (error) return null
      return (data ?? null) as TripDossie | null
    },
  })
  return { data: q.data ?? null }
}
