import { ViagensKPIRow } from './components/ViagensKPIRow'
import { ViagensTable } from './components/ViagensTable'

export function ViagensPage() {
  return (
    <div className="space-y-5">
      <header className="pb-4">
        <h1 className="text-2xl font-bold text-white">Viagens</h1>
        <p className="text-sm text-white/70">Lista completa com filtros e detalhamento</p>
      </header>

      <ViagensKPIRow />

      <ViagensTable />
    </div>
  )
}
