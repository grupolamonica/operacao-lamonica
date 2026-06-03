import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertItem } from '@/components/domain/AlertItem'
import { LogCallDialog } from '@/components/domain/LogCallDialog'
import { useAlerts } from '@/hooks/useAlerts'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export function OperationalQueue({ className }: { className?: string }) {
  const { data: openAlerts } = useAlerts({ status: 'aberto' })
  const qc = useQueryClient()
  const [callAlertId, setCallAlertId] = useState<string | null>(null)

  const queue = [...openAlerts].sort((a, b) => {
    const sev: Record<string, number> = { critico: 0, medio: 1, baixo: 2 }
    return sev[a.severity] - sev[b.severity]
  })

  // Assumir → transiciona a ocorrência para "em_analise" (operador assume a tratativa).
  const assume = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (api.api.alerts as any)[id].transition.post({ to: 'em_analise' })
      if (error) throw new Error('Falha ao assumir ocorrência')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['alert-stats'] })
    },
  })

  const handleAssume = (id: string) => assume.mutate(id)
  const handleCall = (id: string) => setCallAlertId(id)

  return (
    <div className={cn('bg-card border border-border rounded-lg p-4 flex flex-col', className)}>
      <div className="flex items-center justify-between flex-shrink-0 pb-3">
        <h3 className="text-sm font-semibold text-foreground">Fila operacional</h3>
        <span className="text-xs text-muted-foreground">{queue.length} pendentes</span>
      </div>
      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
        {queue.map(a => (
          <AlertItem
            key={a.id}
            variant="queue"
            onAssume={handleAssume}
            onCall={handleCall}
            alert={{
              id: a.id,
              severity: a.severity,
              title: a.title,
              subtitle: a.tripCode,
              driverName: a.driverName,
              driverPhoto: a.driverPhoto,
              plate: a.plate,
              clientName: a.clientName,
              occurredAt: a.occurredAt,
              delayMinutes: a.delayMinutes,
            }}
          />
        ))}
        {queue.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Fila vazia.</p>
        )}
      </div>

      <LogCallDialog
        scope={{ alertId: callAlertId }}
        open={!!callAlertId}
        onClose={() => setCallAlertId(null)}
      />
    </div>
  )
}
