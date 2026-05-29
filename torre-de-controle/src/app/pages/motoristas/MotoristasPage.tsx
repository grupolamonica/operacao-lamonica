import { ExportButton } from '@/components/common/ExportButton'
import { MotoristasKPIRow } from './components/MotoristasKPIRow'
import { MotoristasTable } from './components/MotoristasTable'

export function MotoristasPage() {
  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Motoristas</h1>
          <p className="text-sm text-white/70">Equipe ativa, documentos e desempenho</p>
        </div>
        <ExportButton entity="motoristas" />
      </header>

      <MotoristasKPIRow />
      <MotoristasTable />
    </div>
  )
}
