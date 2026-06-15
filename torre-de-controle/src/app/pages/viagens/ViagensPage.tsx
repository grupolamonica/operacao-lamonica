import { useState } from 'react'
import { ExportButton } from '@/components/common/ExportButton'
import { PeriodFilter, type Period } from '@/components/domain/PeriodFilter'
import { ViagensKPIRow } from './components/ViagensKPIRow'
import { ViagensTable } from './components/ViagensTable'
import { CargasAbertasPanel } from './components/CargasAbertasPanel'

export function ViagensPage() {
  const [periodo, setPeriodo] = useState<Period>('tudo')
  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Viagens</h1>
          <p className="text-sm text-white/70">Lista completa com filtros e detalhamento</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <PeriodFilter label="Período (descarga)" value={periodo} onChange={setPeriodo} />
          <ExportButton entity="viagens" />
        </div>
      </header>

      <ViagensKPIRow />

      <ViagensTable period={periodo} />

      {/* Phase 14 — cargas em aberto (sem motorista) + alocação no Cargas */}
      <div className="bg-card border border-border rounded-lg p-4">
        <CargasAbertasPanel />
      </div>
    </div>
  )
}
