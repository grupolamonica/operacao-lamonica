import { MotoristasKPIRow } from './components/MotoristasKPIRow'
import { MotoristasTable } from './components/MotoristasTable'

export function MotoristasPage() {
  return (
    <div className="space-y-5">
      <header className="pb-4">
        <h1 className="text-2xl font-bold text-white">Motoristas</h1>
        <p className="text-sm text-white/70">Equipe ativa, documentos e desempenho</p>
      </header>

      <MotoristasKPIRow />
      <MotoristasTable />
    </div>
  )
}
