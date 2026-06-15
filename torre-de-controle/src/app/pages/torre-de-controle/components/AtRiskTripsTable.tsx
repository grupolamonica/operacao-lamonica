import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable } from '@/components/domain/DataTable'
import { tripProgressColumns, useLiveTrips } from '@/app/pages/dashboard/components/TripsInProgressTable'
import { type Period, periodStart } from '@/components/domain/PeriodFilter'

/**
 * Viagens em maior risco (D-14, Onda B). Mesmas colunas de "Viagens em andamento"
 * (Motorista · Km Falta · Prazo Final · Previsão · Status · Atraso · Progresso),
 * mas só as ATRASADAS, ordenadas pela mais próxima do Prazo Final (windowEnd asc).
 * Período "filtra tudo" da Torre: escopo por data de descarga prevista (eta/prazo).
 */
const ms = (d?: Date | string | null) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY)

export function AtRiskTripsTable({ period = 'tudo' }: { period?: Period }) {
  const navigate = useNavigate()
  const mapped = useLiveTrips({ status: 'in_progress' })

  const atrasadas = useMemo(() => {
    const start = periodStart(period)
    return mapped
      .filter((t) => t.slaStatus === 'atrasado' || (t.adiantamentoHoras ?? 0) > 0.0167)
      .filter((t) => {
        if (!start) return true
        const a = t.arrivedAt ?? t.eta ?? t.windowEnd
        return a ? new Date(a).getTime() >= start.getTime() : false
      })
      .sort((a, b) => ms(a.windowEnd) - ms(b.windowEnd))
  }, [mapped, period])

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
