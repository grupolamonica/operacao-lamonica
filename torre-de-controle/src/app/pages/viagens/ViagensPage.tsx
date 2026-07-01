import { useState } from 'react'
import { ExportButton } from '@/components/common/ExportButton'
import { PrazoFinalFilter, type PrazoRange, defaultPrazoRange } from '@/components/domain/PrazoFinalFilter'
import { ViagensKPIRow } from './components/ViagensKPIRow'
import { ViagensTable } from './components/ViagensTable'
import { CargasAbertasPanel } from './components/CargasAbertasPanel'
import { CargasAlocadasPanel } from './components/CargasAlocadasPanel'
import { AlocacaoSpxPanel } from './components/AlocacaoSpxPanel'

export function ViagensPage() {
  const [range, setRange] = useState<PrazoRange>(() => defaultPrazoRange('op')) // hoje (igual ao painel)
  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Viagens</h1>
          <p className="text-sm text-white/70">Lista completa com filtros e detalhamento</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <PrazoFinalFilter value={range} onChange={setRange} />
          <ExportButton entity="viagens" />
        </div>
      </header>

      <ViagensKPIRow />

      <ViagensTable range={range} />

      {/* Alocação direta na viagem SPX (motorista + cavalo/carreta via sidecar) */}
      <div className="bg-card border border-border rounded-lg p-4">
        <AlocacaoSpxPanel />
      </div>

      {/* Phase 14 — cargas em aberto (sem motorista) + alocação no Cargas */}
      <div className="bg-card border border-border rounded-lg p-4">
        <CargasAbertasPanel />
      </div>

      {/* Cargas alocadas (com motorista) + desalocação */}
      <div className="bg-card border border-border rounded-lg p-4">
        <CargasAlocadasPanel />
      </div>
    </div>
  )
}
