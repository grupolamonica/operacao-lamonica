import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertasKPIRow } from './components/AlertasKPIRow'
import { AlertasFiltersBar } from './components/AlertasFiltersBar'
import { AlertGroupedList } from './components/AlertGroupedList'
import { AlertDetailPanel } from './components/AlertDetailPanel'
import { AlertasStatusBreakdown } from './components/AlertasStatusBreakdown'
import { ExportButton } from '@/components/common/ExportButton'
import { FixedPanel } from '@/components/domain/FixedPanel'
import { useAlerts, useAlert } from '@/hooks/useAlerts'
import { useUIStore } from '@/stores/useUIStore'
import type { AlertFilters, AlertStatus } from '@/data/types'

export function AlertasPage() {
  const [filters, setFilters] = useState<AlertFilters>({ period: 'today' })
  const { data: alerts } = useAlerts(filters)
  const { selectedAlertId, setSelectedAlertId } = useUIStore()
  const { data: selected } = useAlert(selectedAlertId)
  const isOpen = selected !== null

  // Phase 13 — deep-link do dashboard: /alertas?alert=<id> abre o ticket direto.
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const a = searchParams.get('alert')
    if (a) setSelectedAlertId(a)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function handleStatusSelect(s: AlertStatus | null) {
    setFilters((f) => ({ ...f, status: s ?? undefined }))
  }

  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Ocorrências</h1>
          <p className="text-sm text-white/70">Centro operacional — funil, tratativas e SLA</p>
        </div>
        <ExportButton entity="alertas" filters={filters} />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <AlertasKPIRow />
        </div>
        <AlertasStatusBreakdown
          activeStatus={(filters.status ?? null) as AlertStatus | null}
          onSelect={handleStatusSelect}
        />
      </div>

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
