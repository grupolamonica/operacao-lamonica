import { useState } from 'react'
import { DashboardKPIRow } from './components/DashboardKPIRow'
import { TripsInProgressTable } from './components/TripsInProgressTable'
import { ExceptionsAlertsPanel } from './components/ExceptionsAlertsPanel'
import { OperationalSummary } from './components/OperationalSummary'
import { LiveMap } from '@/components/domain/LiveMap'
import { PrazoFinalFilter, type PrazoRange, defaultPrazoRange } from '@/components/domain/PrazoFinalFilter'

export function DashboardPage() {
  const [range, setRange] = useState<PrazoRange>(() => defaultPrazoRange('op')) // hoje (igual ao painel)

  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard Operacional</h1>
          <p className="text-sm text-white/70">Visão geral em tempo real da operação</p>
        </div>
        <PrazoFinalFilter value={range} onChange={setRange} />
      </header>

      <DashboardKPIRow range={range} />

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
        <div className="lg:col-span-7 space-y-5">
          <LiveMap height={360} />
          <TripsInProgressTable />
        </div>
        <div className="lg:col-span-3 space-y-5">
          {/* SLA removido — Resumo operacional no topo (pedido do usuário) */}
          <OperationalSummary range={range} />
          <ExceptionsAlertsPanel range={range} />
        </div>
      </div>
    </div>
  )
}
