import { ExportButton } from '@/components/common/ExportButton'
import { ViagensKPIRow } from './components/ViagensKPIRow'
import { ViagensTable } from './components/ViagensTable'
import { CargasAbertasPanel } from './components/CargasAbertasPanel'

export function ViagensPage() {
  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Viagens</h1>
          <p className="text-sm text-white/70">Lista completa com filtros e detalhamento</p>
        </div>
        <ExportButton entity="viagens" />
      </header>

      <ViagensKPIRow />

      <ViagensTable />

      {/* Phase 14 — cargas em aberto (sem motorista) + alocação no Cargas */}
      <div className="bg-card border border-border rounded-lg p-4">
        <CargasAbertasPanel />
      </div>
    </div>
  )
}
