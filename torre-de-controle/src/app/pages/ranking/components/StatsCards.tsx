import { KPICard } from '@/components/domain/KPICard'
import { useRankingStats, type RankingFilterOpts } from '@/hooks/useRanking'
import { Users, BarChart3, Route, ShieldAlert } from 'lucide-react'

/**
 * StatsCards — 4 KPIs Argon da pagina /ranking (PHASE8-STATSCARDS).
 *
 * Numeros vem PRONTOS de GET /api/ranking/stats via useRankingStats (08-01);
 * este componente apenas exibe (read-only, sem recomputo). Enquanto carrega,
 * mostra em-dash no lugar do valor — mesmo padrao calmo do dashboard.
 *
 * Grid Argon de 4 colunas (mirror do DashboardKPIRow). pt-2 da folga ao icone
 * flutuante do KPICard (top: -1.25rem).
 */
export function StatsCards({ opts }: { opts?: RankingFilterOpts }) {
  const { data: stats, isLoading } = useRankingStats(opts)
  const v = (n: number) => (isLoading ? '—' : n)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 pt-2">
      <KPICard
        title="Motoristas Ativos"
        value={v(stats.activeDrivers)}
        icon={Users}
        color="blue"
      />
      <KPICard
        title="Média Top 3"
        value={v(stats.top3Avg)}
        subtitle="pts"
        icon={BarChart3}
        color="green"
      />
      <KPICard
        title="Total Viagens"
        value={v(stats.totalTrips)}
        icon={Route}
        color="purple"
      />
      <KPICard
        title="Bloqueios"
        value={v(stats.activeBlocks)}
        icon={ShieldAlert}
        color="orange"
      />
    </div>
  )
}
