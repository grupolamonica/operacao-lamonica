import { redis } from '../../redis/client'
import { logger } from '../../lib/logger'

/**
 * Manifesto (baixa de manifesto) — service, Fase F3.
 *
 * O coletor (desktop, fora do docker) faz POST periódico (~5 min) do snapshot
 * COMPLETO de pendências de baixa de manifesto (Sascar). A API guarda o
 * snapshot inteiro no Redis (chave abaixo), SEM TTL — Redis é persistente
 * (appendonly) e o coletor é a fonte da verdade: se a chave zerar, o próximo
 * ciclo do coletor restaura tudo. Não há tabela Postgres no v1 (ver F3-PLANO.md).
 */

const REDIS_KEY = 'manifesto:pendencias:v1'

export interface ManifestoRef {
  codman: number
  filial: number
}

export interface Telefone {
  rotulo: string
  numero: string
}

// Bloco da SM da Angellira (v2, sinal principal do estado) — ver V2-CONTRATO.md.
// additionalProperties na origem (schema TypeBox): campos podem evoluir na fase
// de rodagem, por isso a interface aqui também fica só com os campos conhecidos
// + índice aberto.
export interface ManifestoSm {
  // nullable: coletor manda null quando a SM não tem o dado (ver manifesto.plugin.ts)
  codigo?: string | null
  status_viagem?: string | null
  status_entrega?: string | null
  cliente?: string | null
  chegada_local?: string | null
  saida_local?: string | null
  tempo_descarga?: string | null
  atraso?: string | null
  km_faltante?: number | null
  previsao_chegada_local?: string | null
  grade_inicio_local?: string | null
  grade_fim_local?: string | null
  [key: string]: unknown
}

export interface ManifestoTravaBau {
  estado?: string
  destravou_no_destino_local?: string | null
  [key: string]: unknown
}

export interface ManifestoMacro {
  ultima?: string
  quando_local?: string | null
  digitado?: string | null
  [key: string]: unknown
}

// v2 (11/08, furo real): caminhão descarrega e vai embora, mas o manifesto
// continua aberto por morosidade do operador — ver manifesto.plugin.ts.
export interface ManifestoDestinoHistorico {
  chegou_local?: string | null
  saiu_local?: string | null
  parado_min_descarga_local?: string | null
  macro_fim_no_destino_local?: string | null
  [key: string]: unknown
}

/**
 * v1 e v2 coexistem no mesmo snapshot armazenado (Redis) — ver manifesto.plugin.ts
 * para o detalhe de por que TODOS os campos são opcionais (o coletor.py v1 e o
 * coletor_v2.py enviam formatos diferentes no mesmo endpoint, ver V2-CONTRATO.md).
 */
export interface ManifestoPendencia {
  // v1
  codlpr?: number
  placa?: string
  estagio?: 'descarregando' | 'descarregado'
  manifestos?: ManifestoRef[]
  chegada_gmt?: string | null
  chegada_local?: string | null
  fim_gmt?: string | null
  fim_local?: string | null
  idPacote?: string | null
  detectada_em?: string
  viagem?: {
    origem: string
    saida_local: string | null
    previsao_local: string | null
    carreta: string
    motorista2: string
    destino_uf?: string
    motorista_fone?: string
    motorista2_fone?: string
    motorista_fones?: Telefone[]
    motorista2_fones?: Telefone[]
  } | null
  digitado?: string | null
  posicao_diverge?: boolean
  origem_deteccao?: string

  // comuns aos dois formatos
  motorista?: string
  cliente?: string
  destino?: string
  // v1: objeto de evidências físicas (fase de observação) · v2: array de códigos
  evidencias?: Record<string, unknown> | string[] | null
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
    [key: string]: unknown
  } | null

  // v2 — ver V2-CONTRATO.md
  codman?: number
  filial?: number
  serie?: string
  emissao_local?: string | null
  prazo_entrega_local?: string | null
  horas_aberto?: number | null
  horas_atraso?: number
  cavalo?: string
  carreta?: string
  motorista_fones?: Telefone[]
  destino_uf?: string
  // abas da tela FROTA × DEMAIS (decisão Danilo 11/08 — ver V2-CONTRATO.md)
  na_frota_sascar?: boolean
  comprovacao_trava?: boolean | null
  estado?: 'descarregado' | 'descarregando' | 'aguardando_descarga' | 'em_transito' | 'sem_rastreio'
  origem_estado?: 'sm' | 'sascar' | 'macro'
  sm?: ManifestoSm | null
  trava_bau?: ManifestoTravaBau | null
  macro?: ManifestoMacro | null
  destino_historico?: ManifestoDestinoHistorico | null
}

export interface ManifestoSnapshotInput {
  versao?: number
  gerado_em: string
  pendencias: ManifestoPendencia[]
}

interface StoredSnapshot {
  gerado_em: string
  recebido_em: string
  pendencias: ManifestoPendencia[]
}

export type ApplySnapshotResult =
  | { aplicado: true; total: number }
  | { aplicado: false; motivo: string }

async function getStored(): Promise<StoredSnapshot | null> {
  const raw = await redis.get(REDIS_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredSnapshot
  } catch (e: any) {
    logger.error({ error: e?.message ?? String(e) }, '[manifesto] snapshot corrompido no Redis — ignorando')
    return null
  }
}

/**
 * Aplica um snapshot novo, com guarda de ordem por `gerado_em`: um POST
 * atrasado (retry do coletor) nunca regride o snapshot já armazenado.
 * Compara como string ISO — `gerado_em` do coletor é sempre o mesmo formato
 * (sem timezone), então a comparação lexicográfica equivale à cronológica.
 */
export async function applySnapshot(input: ManifestoSnapshotInput): Promise<ApplySnapshotResult> {
  const current = await getStored()
  if (current && input.gerado_em <= current.gerado_em) {
    return { aplicado: false, motivo: 'snapshot mais antigo' }
  }
  const stored: StoredSnapshot = {
    gerado_em: input.gerado_em,
    recebido_em: new Date().toISOString(),
    pendencias: input.pendencias,
  }
  await redis.set(REDIS_KEY, JSON.stringify(stored))
  logger.info({ gerado_em: input.gerado_em, total: input.pendencias.length }, '[manifesto] snapshot aplicado')
  return { aplicado: true, total: input.pendencias.length }
}

export interface ManifestoPendenciasView {
  gerado_em: string | null
  recebido_em: string | null
  idade_min: number | null
  total: number
  pendencias: ManifestoPendencia[]
}

/** Lê o snapshot atual para a tela; sem snapshot ainda, devolve tudo nulo/vazio. */
export async function getPendencias(): Promise<ManifestoPendenciasView> {
  const stored = await getStored()
  if (!stored) {
    return { gerado_em: null, recebido_em: null, idade_min: null, total: 0, pendencias: [] }
  }
  const idade_min = Math.round((Date.now() - new Date(stored.recebido_em).getTime()) / 60_000)
  return {
    gerado_em: stored.gerado_em,
    recebido_em: stored.recebido_em,
    idade_min,
    total: stored.pendencias.length,
    pendencias: stored.pendencias,
  }
}
