import { useState } from 'react'
import { ChevronDown, ChevronRight, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { AlertItem } from '@/components/domain/AlertItem'
import { useUIStore } from '@/stores/useUIStore'
import { cn } from '@/lib/utils'
import type { Alert, AlertSeverity } from '@/data/types'

const groupConfig: Record<AlertSeverity, { label: string; Icon: typeof AlertCircle; color: string }> = {
  critico: { label: 'Críticos', Icon: AlertCircle,    color: 'text-danger' },
  medio:   { label: 'Médios',   Icon: AlertTriangle,  color: 'text-warning' },
  baixo:   { label: 'Baixos',   Icon: Info,           color: 'text-success' },
}

interface Props {
  alerts: Alert[]
}

export function AlertGroupedList({ alerts }: Props) {
  const { selectedAlertId, setSelectedAlertId } = useUIStore()
  const [open, setOpen] = useState<Record<AlertSeverity, boolean>>({ critico: true, medio: true, baixo: false })

  const groups: Record<AlertSeverity, Alert[]> = {
    critico: alerts.filter(a => a.severity === 'critico'),
    medio:   alerts.filter(a => a.severity === 'medio'),
    baixo:   alerts.filter(a => a.severity === 'baixo'),
  }

  return (
    <div className="space-y-3">
      {(['critico', 'medio', 'baixo'] as const).map(sev => {
        const cfg = groupConfig[sev]
        const list = groups[sev]
        const isOpen = open[sev]
        const Chev = isOpen ? ChevronDown : ChevronRight

        return (
          <div key={sev} className="bg-card border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setOpen({ ...open, [sev]: !isOpen })}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-2">
                <Chev className="h-4 w-4 text-muted-foreground" />
                <cfg.Icon className={cn('h-5 w-5', cfg.color)} />
                <span className="text-sm font-semibold text-foreground">{cfg.label}</span>
                <span className="text-xs text-muted-foreground">({list.length})</span>
              </div>
            </button>

            {isOpen && (
              <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                {list.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum alerta neste grupo.</p>
                ) : (
                  list.map(a => (
                    <AlertItem
                      key={a.id}
                      variant="list"
                      onClick={(id) => setSelectedAlertId(id)}
                      selected={selectedAlertId === a.id}
                      alert={{
                        id: a.id, severity: a.severity, title: a.title, subtitle: a.tripCode,
                        driverName: a.driverName, driverPhoto: a.driverPhoto, plate: a.plate,
                        clientName: a.clientName, occurredAt: a.occurredAt, delayMinutes: a.delayMinutes,
                      }}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
