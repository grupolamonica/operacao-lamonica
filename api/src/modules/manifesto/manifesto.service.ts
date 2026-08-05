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

export interface ManifestoPendencia {
  codlpr: number
  placa: string
  motorista: string
  cliente: string
  destino: string
  estagio: 'descarregando' | 'descarregado'
  manifestos: ManifestoRef[]
  chegada_gmt: string | null
  chegada_local: string | null
  fim_gmt: string | null
  fim_local: string | null
  idPacote: string | null
  detectada_em: string
}

export interface ManifestoSnapshotInput {
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
