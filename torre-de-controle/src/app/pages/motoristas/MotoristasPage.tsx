import { MotoristasKPIRow } from './components/MotoristasKPIRow'
import { MotoristasTable } from './components/MotoristasTable'

export function MotoristasPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-foreground">Motoristas</h1>
        <p className="text-sm text-muted-foreground">Equipe ativa, documentos e desempenho</p>
      </header>

      <MotoristasKPIRow />
      <MotoristasTable />
    </div>
  )
}
