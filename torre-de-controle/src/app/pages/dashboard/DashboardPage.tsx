import { DashboardKPIRow } from './components/DashboardKPIRow'
import { TripsInProgressTable } from './components/TripsInProgressTable'
import { ExceptionsAlertsPanel } from './components/ExceptionsAlertsPanel'
import { OperationalSummary } from './components/OperationalSummary'
import { MapPlaceholder } from '@/components/domain/MapPlaceholder'

export function DashboardPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Operacional</h1>
        <p className="text-sm text-muted-foreground">Visão geral em tempo real da operação</p>
      </header>

      <DashboardKPIRow />

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
        <div className="lg:col-span-7 space-y-5">
          <MapPlaceholder height={360} />
          <TripsInProgressTable />
        </div>
        <div className="lg:col-span-3 space-y-5">
          <ExceptionsAlertsPanel />
          <OperationalSummary />
        </div>
      </div>
    </div>
  )
}
