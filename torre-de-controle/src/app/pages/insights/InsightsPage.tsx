import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import {
  useSlaHistory,
  useDriversRanking,
  useProblematicRoutes,
  useAlertsDistribution,
  type Range,
} from '@/hooks/useInsights'
import { DateRangePicker } from './components/DateRangePicker'
import { SlaHistoricoChart } from './components/SlaHistoricoChart'
import { MotoristasRankingChart } from './components/MotoristasRankingChart'
import { RotasProblematicasTable } from './components/RotasProblematicasTable'
import { AlertasDistribuicaoChart } from './components/AlertasDistribuicaoChart'

function isValidRange(s: string | null): s is Range {
  return s === '7d' || s === '30d' || s === '90d'
}

/**
 * Página /insights — 4 cards Chart.js + cross-filter visual (CONTEXT D-01..D-05).
 *
 * Layout:
 * - Header: title + DateRangePicker (preset 7d/30d/90d)
 * - Banner cross-filter (quando dateFilter ativo): "Filtrado por: YYYY-MM-DD [×]"
 * - Grid responsivo lg:grid-cols-2 xl:grid-cols-4 (D-25)
 *   - SlaHistoricoChart (line, onPointClick → cross-filter)
 *   - MotoristasRankingChart (bar, click → /motoristas/:id)
 *   - RotasProblematicasTable (table, click → /viagens?route=CODE)
 *   - AlertasDistribuicaoChart (doughnut)
 *
 * State:
 * - `range` persistido em URL via useSearchParams (D-02 shareable links)
 * - `dateFilter` é state local (cross-filter MVP visual — backend não aceita
 *   ?date= dia por trade-off de complexidade vs valor, ver CONTEXT D-04 e
 *   RESEARCH lines 1085-1087)
 */
export function InsightsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawRange = searchParams.get('range')
  const range: Range = isValidRange(rawRange) ? rawRange : '30d'
  const [dateFilter, setDateFilter] = useState<string | null>(null)

  const sla     = useSlaHistory(range)
  const ranking = useDriversRanking(range)
  const routes  = useProblematicRoutes(range)
  const dist    = useAlertsDistribution(range)

  function setRange(r: Range) {
    setSearchParams({ range: r })
    setDateFilter(null) // reset cross-filter when changing range
  }

  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Insights</h1>
          <p className="text-sm text-white/70">Analytics, tendências de SLA e ranking operacional</p>
        </div>
        <div className="ml-auto">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      </header>

      {dateFilter && (
        <div
          className="flex items-center gap-2 rounded-lg bg-card px-4 py-2"
          style={{ border: '1px solid var(--border)' }}
        >
          <span className="text-xs text-muted-foreground">Filtrado por:</span>
          <span className="text-xs font-medium text-foreground tabular-nums">{dateFilter}</span>
          <button
            onClick={() => setDateFilter(null)}
            className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
            aria-label="Limpar filtro"
          >
            <X className="h-3 w-3" />
            Limpar
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <SlaHistoricoChart
          data={sla.data}
          isLoading={sla.isLoading}
          onPointClick={setDateFilter}
        />
        <MotoristasRankingChart
          data={ranking.data}
          isLoading={ranking.isLoading}
          dateFilter={dateFilter}
        />
        <RotasProblematicasTable
          data={routes.data}
          isLoading={routes.isLoading}
          dateFilter={dateFilter}
        />
        <AlertasDistribuicaoChart
          data={dist.data}
          isLoading={dist.isLoading}
          dateFilter={dateFilter}
        />
      </div>
    </div>
  )
}
