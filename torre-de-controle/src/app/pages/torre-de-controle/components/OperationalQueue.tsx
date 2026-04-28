import { AlertItem } from '@/components/domain/AlertItem'
import { useAlerts } from '@/hooks/useAlerts'

export function OperationalQueue() {
  const { data: openAlerts } = useAlerts({ status: 'aberto' })
  const queue = [...openAlerts].sort((a, b) => {
    const sev: Record<string, number> = { critico: 0, medio: 1, baixo: 2 }
    return sev[a.severity] - sev[b.severity]
  })

  const handleAssume = (id: string) => console.log('assume', id)
  const handleCall = (id: string) => console.log('call', id)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Fila operacional</h3>
        <span className="text-xs text-gray-500">{queue.length} pendentes</span>
      </div>
      <div className="space-y-2 max-h-[480px] overflow-y-auto">
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
          <p className="text-sm text-gray-500 text-center py-6">Fila vazia.</p>
        )}
      </div>
    </div>
  )
}
