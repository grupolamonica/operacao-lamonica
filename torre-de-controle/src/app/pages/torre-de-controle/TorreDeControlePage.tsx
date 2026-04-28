import { TorreKPIRow } from './components/TorreKPIRow'
import { AtRiskTripsTable } from './components/AtRiskTripsTable'
import { OperationalQueue } from './components/OperationalQueue'
import { OperatorsQueue } from './components/OperatorsQueue'
import { MapPlaceholder } from '@/components/domain/MapPlaceholder'

export function TorreDeControlePage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Torre de Controle</h1>
        <p className="text-sm text-muted-foreground">Fila priorizada de incidentes e operação ativa</p>
      </header>

      <TorreKPIRow />

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
        <div className="lg:col-span-7 space-y-5">
          <MapPlaceholder height={420} />
          <AtRiskTripsTable />
        </div>
        <div className="lg:col-span-3 space-y-5">
          <OperationalQueue />
          <OperatorsQueue />
        </div>
      </div>
    </div>
  )
}
