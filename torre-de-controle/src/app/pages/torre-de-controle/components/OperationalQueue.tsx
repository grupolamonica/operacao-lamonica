import { AlertItem } from '@/components/domain/AlertItem'
import { useAlerts } from '@/hooks/useAlerts'
import { cn } from '@/lib/utils'

export function OperationalQueue({ className }: { className?: string }) {
  const { data: openAlerts } = useAlerts({ status: 'aberto' })
  const queue = [...openAlerts].sort((a, b) => {
    const sev: Record<string, number> = { critico: 0, medio: 1, baixo: 2 }
    return sev[a.severity] - sev[b.severity]
  })

  const handleAssume = (id: string) => console.log('assume', id)
  const handleCall = (id: string) => console.log('call', id)

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
    </div>
  )
}
