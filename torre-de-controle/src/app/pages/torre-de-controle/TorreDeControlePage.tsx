import { useState } from 'react'
import { TorreKPIRow } from './components/TorreKPIRow'
import { AtRiskTripsTable } from './components/AtRiskTripsTable'
import { OperationalQueue } from './components/OperationalQueue'
import { OperatorsQueue } from './components/OperatorsQueue'
import { VehicleQuickPanel } from './components/VehicleQuickPanel'
import { LiveMap } from '@/components/domain/LiveMap'
import { PrazoFinalFilter, type PrazoRange, defaultPrazoRange } from '@/components/domain/PrazoFinalFilter'

export function TorreDeControlePage() {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [range, setRange] = useState<PrazoRange>(() => defaultPrazoRange('op')) // hoje (igual ao painel)

  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Torre de Controle</h1>
          <p className="text-sm text-white/70">Fila priorizada de incidentes e operação ativa</p>
        </div>
        <PrazoFinalFilter value={range} onChange={setRange} />
      </header>

      <TorreKPIRow range={range} />

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
        {/* Map shrinks when the quick panel is open to give it room */}
        <div className={selectedVehicleId ? 'lg:col-span-4 min-w-0' : 'lg:col-span-7 min-w-0'}>
          <LiveMap
            height={420}
            selectedVehicleId={selectedVehicleId}
            onVehicleClick={(id) => setSelectedVehicleId((cur) => (cur === id ? null : id))}
          />
        </div>
        {selectedVehicleId && (
          <div className="lg:col-span-3 min-w-0">
            <VehicleQuickPanel vehicleId={selectedVehicleId} onClose={() => setSelectedVehicleId(null)} />
          </div>
        )}
        <div className="lg:col-span-3 min-w-0">
          <OperatorsQueue className="h-[420px] overflow-y-auto" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-5 items-stretch">
        <div className="lg:col-span-7 min-w-0">
          <AtRiskTripsTable range={range} />
        </div>
        <div className="lg:col-span-3 min-w-0">
          <OperationalQueue className="max-h-[650px]" range={range} />
        </div>
      </div>
    </div>
  )
}
