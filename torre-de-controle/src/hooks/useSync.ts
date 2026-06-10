import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface SyncSourceResult { ok: boolean; ms: number; result?: unknown; error?: string }
export interface SyncAllSummary {
  startedAt: string
  finishedAt: string
  durationMs: number
  sources: Record<'painel' | 'monitoring' | 'positions' | 'cargas', SyncSourceResult>
}
export interface SyncStatus {
  running: boolean
  startedAt: string | null
  last: SyncAllSummary | null
}

/**
 * Estado da sincronização completa. Faz poll rápido (3s) enquanto roda; lento
 * (60s) quando ociosa. Quando o sync termina (running true→false), invalida
 * TODAS as queries p/ a UI refletir o dado novo.
 */
export function useSyncStatus() {
  const qc = useQueryClient()
  const wasRunning = useRef(false)
  const q = useQuery({
    queryKey: ['sync', 'status'],
    queryFn: async (): Promise<SyncStatus> => {
      const { data, error } = await (api.api as any).sync.status.get()
      if (error || !data) return { running: false, startedAt: null, last: null }
      return data as SyncStatus
    },
    refetchInterval: (query) => ((query.state.data as SyncStatus | undefined)?.running ? 3_000 : 60_000),
  })

  useEffect(() => {
    const running = !!q.data?.running
    if (wasRunning.current && !running) qc.invalidateQueries() // acabou de concluir
    wasRunning.current = running
  }, [q.data?.running, qc])

  return { data: q.data ?? { running: false, startedAt: null, last: null } }
}

/** Dispara o sync completo em background (retorna na hora; o status acompanha). */
export function useSyncAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<{ started: boolean; running: boolean }> => {
      const { data, error } = await (api.api as any).sync.all.post()
      if (error) throw new Error('Falha ao iniciar sincronização')
      return data as { started: boolean; running: boolean }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sync', 'status'] }) },
  })
}
