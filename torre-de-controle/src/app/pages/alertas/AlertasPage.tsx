import { useState } from 'react'
import { AlertasKPIRow } from './components/AlertasKPIRow'
import { AlertasFiltersBar } from './components/AlertasFiltersBar'
import { AlertGroupedList } from './components/AlertGroupedList'
import { AlertDetailPanel } from './components/AlertDetailPanel'
import { FixedPanel } from '@/components/domain/FixedPanel'
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
      <header className="pb-4">
        <h1 className="text-2xl font-bold text-white">Alertas</h1>
        <p className="text-sm text-white/70">Lista priorizada e tratativas</p>
      </header>

      <AlertasKPIRow />

      <AlertasFiltersBar filters={filters} onChange={setFilters} />

      <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0">
          <AlertGroupedList alerts={alerts} />
        </div>

        {isOpen && selected && (
          <FixedPanel width={440}>
            <AlertDetailPanel alert={selected} onClose={() => setSelectedAlertId(null)} />
          </FixedPanel>
        )}
      </div>
    </div>
  )
}
