import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Baixa de Manifesto — snapshot do coletor (Sascar + Rodopar), publicado via POST
// no torre e guardado em Redis (T1). A tela só lê, GET atrás do cookie JWT.

export interface PendenciaManifesto {
  codlpr: number
  placa: string
  motorista: string
  cliente: string
  destino: string
  estagio: 'descarregando' | 'descarregado'
  manifestos: { codman: number; filial: number }[]
  chegada_gmt: string | null
  chegada_local: string | null
  fim_gmt: string | null
  fim_local: string | null
  idPacote: string | null
  detectada_em: string
}

export interface ManifestoPendenciasSnapshot {
  ok: boolean
  // nulos quando ainda não há snapshot (API acabou de subir, coletor nunca enviou)
  gerado_em: string | null
  recebido_em: string | null
  idade_min: number | null
  total: number
  pendencias: PendenciaManifesto[]
}

export function useManifestoPendencias() {
  const q = useQuery({
    queryKey: ['manifesto', 'pendencias'],
    queryFn: async (): Promise<ManifestoPendenciasSnapshot> => {
      const { data, error } = await (api.api as any).manifesto.pendencias.get()
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao ler pendências de manifesto')
      return data as ManifestoPendenciasSnapshot
    },
    refetchInterval: 30_000,
  })
  return {
    data: q.data,
    pendencias: q.data?.pendencias ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
  }
}
