import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend,
} from 'chart.js'
import { useThemeStore } from '@/stores/useThemeStore'
import { PanelCard } from '@/components/domain/PanelCard'
import type { SlaPoint } from '@/hooks/useInsights'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

function cssVar(name: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

interface Props {
  data:         SlaPoint[]
  onPointClick?: (date: string) => void
  isLoading?:   boolean
}

/**
 * Line chart of % SLA "no_prazo" aggregated by day (CONTEXT D-01.1).
 * Click em ponto dispara onPointClick com a data ISO — InsightsPage usa para
 * cross-filter (D-04). Re-mount em troca de tema via key={isDark} (Phase 1b
 * SparklineChart analog).
 */
export function SlaHistoricoChart({ data, onPointClick, isLoading }: Props) {
  const { isDark } = useThemeStore()
  const labels      = data.map(d => d.date)
  const slaPercent  = data.map(d => Math.round(d.sla * 1000) / 10) // 0..100 com 1 casa
  const successHex  = '#2dce89' // fallback / Chart.js exige hex puro (D-25 cores Argon)
  const gridColor   = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const tickColor   = isDark ? 'rgba(255,255,255,0.7)'  : 'rgba(0,0,0,0.7)'
  // Try CSS var first (--success) — fall back to hex
  const successVar = cssVar('--success')
  const lineColor  = successVar.startsWith('#') ? successVar : successHex

  return (
    <PanelCard title="SLA Histórico" subtitle="% no prazo">
      <div style={{ height: 300, width: '100%' }}>
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Carregando...
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sem dados no período
          </div>
        ) : (
          <Line
            key={`${isDark}-sla`}
            data={{
              labels,
              datasets: [{
                label:           'SLA %',
                data:            slaPercent,
                borderColor:     lineColor,
                backgroundColor: lineColor + '33',
                tension:         0.3,
                fill:            true,
                pointRadius:     4,
                pointHoverRadius: 6,
                pointBackgroundColor: lineColor,
              }],
            }}
            options={{
              responsive:          true,
              maintainAspectRatio: false,
              onClick: (_, elements) => {
                if (elements.length && onPointClick) {
                  onPointClick(labels[elements[0].index])
                }
              },
              plugins: {
                legend:  { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => `${(ctx.parsed.y ?? 0).toFixed(1)}% no prazo`,
                  },
                },
              },
              scales: {
                y: {
                  min: 0, max: 100,
                  ticks: { color: tickColor, callback: (v) => v + '%' },
                  grid:  { color: gridColor },
                },
                x: {
                  ticks: { color: tickColor },
                  grid:  { color: gridColor },
                },
              },
            }}
          />
        )}
      </div>
    </PanelCard>
  )
}
