import { useState } from 'react'
import { DashboardKPIRow } from './components/DashboardKPIRow'
import { TripsInProgressTable } from './components/TripsInProgressTable'
import { ExceptionsAlertsPanel } from './components/ExceptionsAlertsPanel'
import { OperationalSummary } from './components/OperationalSummary'
import { LiveMap } from '@/components/domain/LiveMap'
import { SlaDashboardWidget } from '@/components/domain/SlaDashboardWidget'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PeriodoSla } from '@/data/types'

export function DashboardPage() {
  const [periodo, setPeriodo] = useState<PeriodoSla>('tudo')  // abre mostrando toda a operação, como o painel

  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard Operacional</h1>
          <p className="text-sm text-white/70">Visão geral em tempo real da operação</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-white/70">Período (SLA)</span>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoSla)}>
            <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
              <SelectItem value="tudo">Tudo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <DashboardKPIRow periodo={periodo} />

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
        <div className="lg:col-span-7 space-y-5">
          <LiveMap height={360} />
          <TripsInProgressTable />
        </div>
        <div className="lg:col-span-3 space-y-5">
          <SlaDashboardWidget />
          <ExceptionsAlertsPanel periodo={periodo} />
          <OperationalSummary periodo={periodo} />
        </div>
      </div>
    </div>
  )
}
