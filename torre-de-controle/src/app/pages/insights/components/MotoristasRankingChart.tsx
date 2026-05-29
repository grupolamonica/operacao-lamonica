import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement, CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js'
import { useNavigate } from 'react-router-dom'
import { useThemeStore } from '@/stores/useThemeStore'
import { PanelCard } from '@/components/domain/PanelCard'
import type { DriverRank } from '@/hooks/useInsights'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

interface Props {
  data:        DriverRank[]
  isLoading?:  boolean
  dateFilter?: string | null
}

/**
 * Horizontal bar chart of top drivers ranked by % SLA. Click em barra
 * navega para /motoristas/:driverId (CONTEXT D-05 drill-down).
 * dateFilter aceito como prop mas backend não filtra por dia — banner
 * visual no parent indica o filtro ativo.
 */
export function MotoristasRankingChart({ data, isLoading }: Props) {
  const { isDark }  = useThemeStore()
  const navigate    = useNavigate()
  const tickColor   = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)'
  const gridColor   = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const primaryHex  = '#5e72e4'

  const labels       = data.map(d => d.name)
  const slaPercent   = data.map(d => Math.round(d.slaPercent * 1000) / 10)
  const driverIds    = data.map(d => d.driverId)

  return (
    <PanelCard title="Ranking Motoristas" subtitle="% no prazo">
      <div style={{ height: 360, width: '100%' }}>
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Carregando...
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sem dados no período
          </div>
        ) : (
          <Bar
            key={`${isDark}-ranking`}
            data={{
              labels,
              datasets: [{
                label:           'SLA %',
                data:            slaPercent,
                backgroundColor: primaryHex,
                borderRadius:    4,
              }],
            }}
            options={{
              indexAxis:           'y' as const,
              responsive:          true,
              maintainAspectRatio: false,
              onClick: (_, elements) => {
                if (elements.length) {
                  const id = driverIds[elements[0].index]
                  if (id) navigate(`/motoristas/${id}`)
                }
              },
              plugins: {
                legend:  { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${(ctx.parsed.x ?? 0).toFixed(1)}% (${data[ctx.dataIndex]?.totalTrips ?? 0} viagens)`,
                  },
                },
              },
              scales: {
                x: {
                  min: 0, max: 100,
                  ticks: { color: tickColor, callback: (v) => v + '%' },
                  grid:  { color: gridColor },
                },
                y: {
                  ticks: { color: tickColor },
                  grid:  { display: false },
                },
              },
            }}
          />
        )}
      </div>
    </PanelCard>
  )
}
