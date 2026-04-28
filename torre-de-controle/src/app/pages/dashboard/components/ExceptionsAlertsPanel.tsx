import { AlertItem } from '@/components/domain/AlertItem'
import { useAlerts } from '@/hooks/useAlerts'

export function ExceptionsAlertsPanel() {
  const { data: alerts } = useAlerts({ status: 'aberto' })

  // Top 5 críticos+médios para o painel
  const top = [...alerts]
    .sort((a, b) => {
      const sev: Record<string, number> = { critico: 0, medio: 1, baixo: 2 }
      return sev[a.severity] - sev[b.severity]
    })
    .slice(0, 5)

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Exceções e alertas</h3>
        <span className="text-xs text-muted-foreground">{alerts.length} abertos</span>
      </div>
      <div className="space-y-2">
        {top.map(a => (
          <AlertItem
            key={a.id}
            variant="list"
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
      </div>
    </div>
  )
}
