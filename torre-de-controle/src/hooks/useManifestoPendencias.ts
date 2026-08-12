import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Baixa de Manifesto — snapshot do coletor (Sascar + Rodopar), publicado via POST
// no torre e guardado em Redis (T1). A tela só lê, GET atrás do cookie JWT.
//
// v2 (11/08, ver V2-CONTRATO.md): universo passa a ser TODO manifesto aberto
// (~85, não mais só as 4 pendências de baixa). O coletor_v2.py roda em paralelo
// ao coletor.py (v1) até o Danilo aprovar a troca da task — os dois formatos
// podem chegar no mesmo endpoint, por isso TODOS os campos abaixo (dos dois
// formatos) são opcionais e coexistem no mesmo tipo.

export interface Telefone {
  rotulo: string
  numero: string
}

export type EstadoManifesto = 'descarregado' | 'descarregando' | 'aguardando_descarga' | 'em_transito' | 'sem_rastreio'

// Bloco da SM da Angellira (v2) — sinal principal do estado. null quando a
// viagem não tem SM vinculada.
export interface ManifestoSm {
  codigo?: string
  status_viagem?: string
  status_entrega?: string
  cliente?: string
  chegada_local?: string | null
  saida_local?: string | null
  tempo_descarga?: string | null
  atraso?: string | null
  km_faltante?: number | null
  previsao_chegada_local?: string | null
  grade_inicio_local?: string | null
  grade_fim_local?: string | null
}

export interface ManifestoTravaBau {
  estado?: string
  destravou_no_destino_local?: string | null
}

export interface ManifestoMacro {
  ultima?: string
  quando_local?: string | null
  digitado?: string | null
}

export interface PendenciaManifesto {
  // ── v1 ──────────────────────────────────────────────────────────────────
  codlpr?: number
  placa?: string
  estagio?: 'descarregando' | 'descarregado'
  manifestos?: { codman: number; filial: number }[]
  chegada_gmt?: string | null
  chegada_local?: string | null
  fim_gmt?: string | null
  fim_local?: string | null
  idPacote?: string | null
  detectada_em?: string
  // Ficha do painel de detalhes v1 (aditivos/opcionais — coletor antigo não envia)
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
    motorista_fones?: Telefone[]
    motorista2_fones?: Telefone[]
  } | null
  digitado?: string | null
  // selo ⚠: posição no momento da macro não bate com o destino (possível macro por engano)
  posicao_diverge?: boolean
  // como a pendência nasceu: 'macro' (motorista) ou 'gps' (parado no destino, sem macro)
  origem_deteccao?: 'macro' | 'gps'

  // ── comuns aos dois formatos ─────────────────────────────────────────────
  motorista?: string
  cliente?: string
  destino?: string
  // v1: objeto de evidências físicas (fase de observação, não altera estágio)
  // v2: array de códigos que fundamentaram o `estado` (ex.: "sm_entrega_realizada")
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
  } | string[] | null
  // v1: {lat,lng,cidade,uf,ponto_referencia,distancia_m,quando_local}
  // v2 acrescenta km_destino/parado ao MESMO bloco.
  posicao?: {
    lat?: string | null
    lng?: string | null
    cidade?: string
    uf?: string
    ponto_referencia?: string
    distancia_m?: number | null
    quando_local?: string | null
    km_destino?: number | null
    parado?: boolean
  } | null

  // ── v2 (ver V2-CONTRATO.md) ───────────────────────────────────────────────
  codman?: number
  filial?: number
  serie?: string
  emissao_local?: string | null
  prazo_entrega_local?: string | null
  horas_aberto?: number
  horas_atraso?: number
  cavalo?: string
  carreta?: string
  motorista_fones?: Telefone[]
  destino_uf?: string
  // abas da tela FROTA × DEMAIS (decisão Danilo 11/08 — ver V2-CONTRATO.md)
  na_frota_sascar?: boolean
  comprovacao_trava?: boolean | null
  estado?: EstadoManifesto
  origem_estado?: 'sm' | 'sascar' | 'macro'
  sm?: ManifestoSm | null
  trava_bau?: ManifestoTravaBau | null
  macro?: ManifestoMacro | null
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
