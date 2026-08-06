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
  // Campos enriquecidos pelo coletor (viagem/Rodopar, digitado/Sascar, posição/Sascar) —
  // opcionais/anuláveis: snapshot antigo (pré-enriquecimento) continua válido, painel
  // de detalhes renderiza "—" quando ausentes.
  viagem?: {
    origem: string
    saida_local: string | null
    previsao_local: string | null
    carreta: string
    motorista2: string
    destino_uf?: string
    motorista_fone?: string
    motorista2_fone?: string
    // cadastro do Rodopar guarda celular e telefone separados (994 motoristas têm
    // os dois diferentes) — o operador escolhe qual chamar
    motorista_fones?: { rotulo: string; numero: string }[]
    motorista2_fones?: { rotulo: string; numero: string }[]
  } | null
  // fase de observação — evidências físicas (não alteram estágio)
  evidencias?: {
    na_cidade_destino: boolean
    cerca_desde_local: string | null
    parado: boolean
    bau_sensor_presente: boolean | null
    bau_ativo: boolean
    bau_ativo_desde_local: string | null
    bau_ativo_sustentado: boolean
    bau_leituras_ativas: number
    bau_transicoes_no_destino: number
    confirmado_por: string[]
  } | null
  digitado?: string | null
  // selo ⚠: posição no momento da macro não bate com o destino (possível macro por engano)
  posicao_diverge?: boolean
  posicao?: {
    lat: string | null
    lng: string | null
    cidade: string
    uf: string
    ponto_referencia: string
    distancia_m: number | null
    quando_local: string | null
  } | null
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
