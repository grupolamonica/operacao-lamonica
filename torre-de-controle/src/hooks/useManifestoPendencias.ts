import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

// v2 (11/08, furo real): caminhão descarrega e vai embora, mas o manifesto
// continua aberto por morosidade do operador — antes o item voltava pra
// "em trânsito" (saía do radar); agora o coletor mantém o estado com base no
// histórico de permanência no destino. Cada marco é nullable (só existe depois
// que acontece).
export interface ManifestoDestinoHistorico {
  chegou_local?: string | null
  saiu_local?: string | null
  parado_min_descarga_local?: string | null
  macro_fim_no_destino_local?: string | null
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
  destino_historico?: ManifestoDestinoHistorico | null
}

// ── Justificativa do operador (12/08) ──────────────────────────────────────
// Vem do Postgres, NÃO do snapshot: o coletor sobrescreve o snapshot inteiro a cada
// 5 min, então nota gravada nele seria apagada. O GET /pendencias devolve as duas
// coisas juntas (um request só, o polling é de 30s).
export interface TratativaRegistro {
  id: string
  motivo: string
  motivo_rotulo: string
  notes: string | null
  autor: string | null
  criado_em: string
}

export interface ResumoTratativa {
  total: number
  ultima: TratativaRegistro
}

/**
 * Chave do manifesto no formato que a API usa para indexar `tratativas`.
 *
 * ATENÇÃO: é diferente de `chaveManifesto` da BaixaManifestoPage — aquela é chave de
 * UI e precisa cobrir também o formato v1 (codlpr/placa), então leva prefixo. Esta é
 * a chave natural do Rodopar (codman|filial|serie), a mesma do backend. Não unificar:
 * item v1 não tem tratativa, e mudar o prefixo da chave de UI mexeria na seleção da tabela.
 */
export function chaveTratativa(p: PendenciaManifesto): string | null {
  if (p.codman == null || p.filial == null) return null
  // ESPELHA normalizarSerie() do backend (tratativas.service.ts) — trim + corte em 10, o
  // tamanho da coluna. Se as duas divergirem, a nota existe no banco e nunca aparece na tela.
  return `${p.codman}|${p.filial}|${(p.serie ?? '').trim().slice(0, 10)}`
}

export interface ManifestoPendenciasSnapshot {
  ok: boolean
  // nulos quando ainda não há snapshot (API acabou de subir, coletor nunca enviou)
  gerado_em: string | null
  recebido_em: string | null
  idade_min: number | null
  total: number
  pendencias: PendenciaManifesto[]
  // mapa chaveTratativa() → resumo; ausente enquanto a API antiga estiver no ar
  tratativas?: Record<string, ResumoTratativa>
  // lista de motivos vem da API para o seletor não divergir do que ela valida
  motivos?: Record<string, string>
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
    tratativas: q.data?.tratativas ?? {},
    motivos: q.data?.motivos ?? {},
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
  }
}

export interface NovaTratativaInput {
  codman: number
  filial: number
  serie?: string
  placa?: string
  destino?: string
  motivo: string
  notes?: string
}

/** Registra justificativa (append-only). Invalida o snapshot para o resumo aparecer na tela. */
export function useRegistrarTratativa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: NovaTratativaInput) => {
      const { data, error } = await (api.api as any).manifesto.tratativas.post(vars)
      if (error) throw new Error((error.value as any)?.error ?? 'Falha ao registrar justificativa')
      return data as { ok: boolean; tratativa: TratativaRegistro; chave: string }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['manifesto', 'pendencias'] })
      qc.invalidateQueries({ queryKey: ['manifesto', 'tratativas', vars.codman, vars.filial] })
    },
  })
}

/** Histórico completo de um manifesto — só busca quando o painel de detalhes está aberto. */
export function useHistoricoTratativas(
  codman: number | null | undefined,
  filial: number | null | undefined,
  serie?: string | null,
) {
  const habilitado = codman != null && filial != null
  const q = useQuery({
    queryKey: ['manifesto', 'tratativas', codman, filial, serie ?? ''],
    queryFn: async () => {
      const { data, error } = await (api.api as any).manifesto
        .tratativas[String(codman)][String(filial)].get({ query: { serie: (serie ?? '').trim() } })
      if (error) throw new Error('Falha ao ler o histórico de justificativas')
      return (data as { tratativas: TratativaRegistro[] }).tratativas
    },
    enabled: habilitado,
    staleTime: 10_000,
  })
  return { historico: q.data ?? [], isLoading: q.isLoading, isError: q.isError }
}
