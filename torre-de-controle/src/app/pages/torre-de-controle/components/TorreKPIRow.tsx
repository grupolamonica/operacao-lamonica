import { KPICard } from '@/components/domain/KPICard'
import { useTorreKPIs } from '@/hooks/useDashboardKPIs'
import type { PrazoRange } from '@/components/domain/PrazoFinalFilter'

export function TorreKPIRow({ range }: { range: PrazoRange }) {
  const { data: k } = useTorreKPIs(range)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <KPICard
        title="Viagem Atrasada"
        value={k.viagemAtrasada.count}
        color="red"
      />
      <KPICard
        title="Veículo Parado"
        value={k.veiculoParado.count}
        color="orange"
      />
      <KPICard
        title="Viagem no Prazo"
        value={k.viagemNoPrazo.count}
        color="green"
      />
      <KPICard
        title="Viagens ativas"
        value={k.viagensAtivas.count}
        total={k.viagensAtivas.total}
        color="blue"
      />
      <KPICard
        title="Ocorrências abertas"
        value={k.ocorrenciasAbertas.count}
        color="purple"
      />
    </div>
  )
}
