import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import {
  useSlaHistory,
  useDriversRanking,
  useProblematicRoutes,
  useAlertsDistribution,
} from '@/hooks/useInsights'
import { PrazoFinalFilter, type PrazoRange, defaultPrazoRange } from '@/components/domain/PrazoFinalFilter'
import { SlaHistoricoChart } from './components/SlaHistoricoChart'
import { MotoristasRankingChart } from './components/MotoristasRankingChart'
import { RotasProblematicasTable } from './components/RotasProblematicasTable'
import { AlertasDistribuicaoChart } from './components/AlertasDistribuicaoChart'

/**
 * Página /insights — 4 cards Chart.js + cross-filter visual (CONTEXT D-01..D-05).
 *
 * Layout:
 * - Header: title + PrazoFinalFilter (intervalo de datas por Prazo Final; default 30 dias)
 * - Banner cross-filter (quando dateFilter ativo): "Filtrado por: YYYY-MM-DD [×]"
 * - Grid Argon ponderado lg:grid-cols-10 (mirror do Dashboard):
 *   - Row 1: SlaHistoricoChart (col-span-7, line) + AlertasDistribuicaoChart (col-span-3, doughnut)
 *   - Row 2: MotoristasRankingChart (col-span-4, bar) + RotasProblematicasTable (col-span-6, table)
 *   - Todos os cards usam o PanelCard padronizado (mesma superfície Argon)
 *
 * State:
 * - `range` persistido em URL via useSearchParams (D-02 shareable links)
 * - `dateFilter` é state local (cross-filter MVP visual — backend não aceita
 *   ?date= dia por trade-off de complexidade vs valor, ver CONTEXT D-04 e
 *   RESEARCH lines 1085-1087)
 */
export function InsightsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const def = defaultPrazoRange('analytics')   // janela maior p/ os gráficos não ficarem vazios
  const range: PrazoRange = {
    inicio: searchParams.get('inicio') ?? def.inicio,
    fim:    searchParams.get('fim') ?? def.fim,
  }
  const [dateFilter, setDateFilter] = useState<string | null>(null)

  const sla     = useSlaHistory(range)
  const ranking = useDriversRanking(range)
  const routes  = useProblematicRoutes(range)
  const dist    = useAlertsDistribution(range)

  function setRange(r: PrazoRange) {
    const next: Record<string, string> = {}
    if (r.inicio) next.inicio = r.inicio
    if (r.fim) next.fim = r.fim
    setSearchParams(next)             // URL shareable (D-02)
    setDateFilter(null)               // reset cross-filter ao mudar o intervalo
  }

  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Insights</h1>
          <p className="text-sm text-white/70">Analytics, tendências de SLA e ranking operacional</p>
        </div>
        <div className="ml-auto">
          <PrazoFinalFilter value={range} onChange={setRange} />
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

      {/* Argon-weighted layout (mirrors Dashboard's 7/3 grid) instead of 4 cramped
          equal columns: wide time-series on top, balanced ranking + table below. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-10">
        {/* Row 1 — SLA line (wide) + alerts doughnut (compact) */}
        <div className="lg:col-span-7">
          <SlaHistoricoChart
            data={sla.data}
            isLoading={sla.isLoading}
            onPointClick={setDateFilter}
          />
        </div>
        <div className="lg:col-span-3">
          <AlertasDistribuicaoChart
            data={dist.data}
            isLoading={dist.isLoading}
            dateFilter={dateFilter}
          />
        </div>

        {/* Row 2 — driver ranking (medium) + problematic routes table (wide) */}
        <div className="lg:col-span-4">
          <MotoristasRankingChart
            data={ranking.data}
            isLoading={ranking.isLoading}
            dateFilter={dateFilter}
          />
        </div>
        <div className="lg:col-span-6">
          <RotasProblematicasTable
            data={routes.data}
            isLoading={routes.isLoading}
            dateFilter={dateFilter}
          />
        </div>
      </div>
    </div>
  )
}
