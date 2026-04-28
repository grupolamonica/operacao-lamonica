import { useState } from 'react'
import { AlertasKPIRow } from './components/AlertasKPIRow'
import { AlertasFiltersBar } from './components/AlertasFiltersBar'
import { AlertGroupedList } from './components/AlertGroupedList'
import { AlertDetailPanel } from './components/AlertDetailPanel'
import { useAlerts, useAlert } from '@/hooks/useAlerts'
import { useUIStore } from '@/stores/useUIStore'
import type { AlertFilters } from '@/data/types'

export function AlertasPage() {
  const [filters, setFilters] = useState<AlertFilters>({ period: 'today' })
  const { data: alerts } = useAlerts(filters)
  const { selectedAlertId, setSelectedAlertId } = useUIStore()
  const { data: selected } = useAlert(selectedAlertId)
  const isOpen = selected !== null

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Alertas</h1>
        <p className="text-sm text-muted-foreground">Lista priorizada e tratativas</p>
      </header>

      <AlertasKPIRow />

      <AlertasFiltersBar filters={filters} onChange={setFilters} />

      <div
        className="grid transition-all duration-300 ease-in-out"
        style={{
          gridTemplateColumns: isOpen ? '1fr 440px' : '1fr 0px',
          gap: isOpen ? '20px' : '0px',
        }}
      >
        <div className="overflow-hidden min-w-0">
          <AlertGroupedList alerts={alerts} />
        </div>

        <div className="overflow-hidden transition-all duration-300" style={{ width: isOpen ? '440px' : '0px' }}>
          {selected && <AlertDetailPanel alert={selected} onClose={() => setSelectedAlertId(null)} />}
        </div>
      </div>
    </div>
  )
}
