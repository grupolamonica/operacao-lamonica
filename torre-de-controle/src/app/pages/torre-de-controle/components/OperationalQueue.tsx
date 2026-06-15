import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertItem } from '@/components/domain/AlertItem'
import { LogCallDialog } from '@/components/domain/LogCallDialog'
import { useAlerts } from '@/hooks/useAlerts'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { PrazoRange } from '@/components/domain/PrazoFinalFilter'

export function OperationalQueue({ className, range }: { className?: string; range: PrazoRange }) {
  // Prazo Final "filtra tudo" da Torre → tickets abertos cuja viagem tem Prazo Final no intervalo.
  const { data: openAlerts } = useAlerts({ status: 'aberto', inicio: range.inicio, fim: range.fim })
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [callAlertId, setCallAlertId] = useState<string | null>(null)

  const queue = [...openAlerts].sort((a, b) => {
    const sev: Record<string, number> = { critico: 0, medio: 1, baixo: 2 }
    return sev[a.severity] - sev[b.severity]
  })

  // Assumir para mim → auto-atribui a ocorrência ao operador logado (assignedTo = eu)
  // e move para "em_tratativa". Porte do botão "Assumir" do painel GAS.
  const assume = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (api.api.alerts as any)[id].assign.patch()
      if (error) throw new Error('Falha ao assumir ocorrência')
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['alert-stats'] })
      // Phase 14 — joga o operador pra tela de Ocorrências com o ticket aberto e já assumido por ele
      navigate(`/alertas?alert=${id}`)
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
              lh: a.lh,
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
