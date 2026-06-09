import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable } from '@/components/domain/DataTable'
import { tripProgressColumns, useLiveTrips } from '@/app/pages/dashboard/components/TripsInProgressTable'

/**
 * Viagens em maior risco (D-14, Onda B). Mesmas colunas de "Viagens em andamento"
 * (Motorista · Km Falta · Prazo Final · Previsão · Status · Atraso · Progresso),
 * mas só as ATRASADAS, ordenadas pela mais próxima do Prazo Final (windowEnd asc).
 */
const ms = (d?: Date | string | null) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY)

export function AtRiskTripsTable() {
  const navigate = useNavigate()
  const mapped = useLiveTrips({ status: 'in_progress' })

  const atrasadas = useMemo(
    () =>
      mapped
        .filter((t) => t.slaStatus === 'atrasado' || (t.adiantamentoHoras ?? 0) > 0.0167)
        .sort((a, b) => ms(a.windowEnd) - ms(b.windowEnd)),
    [mapped],
  )

  return (
    <DataTable
      data={atrasadas}
      columns={tripProgressColumns}
      pageSize={10}
      emptyMessage="Nenhuma viagem atrasada no momento."
      title="Viagens em maior risco"
      subtitle={`${atrasadas.length} atrasadas · mais próxima do prazo primeiro`}
      onRowClick={(t) => navigate(`/viagens?trip=${t.id}`)}
    />
  )
}
