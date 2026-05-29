import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { useThemeStore } from '@/stores/useThemeStore'
import { PanelCard } from '@/components/domain/PanelCard'
import type { AlertDist } from '@/hooks/useInsights'

ChartJS.register(ArcElement, Tooltip, Legend)

interface Props {
  data:        AlertDist[]
  isLoading?:  boolean
  dateFilter?: string | null
}

// Paleta multi-color Argon (D-25 fallback hex — Chart.js exige hex puro)
const PALETTE = [
  '#f5365c', // danger
  '#fb6340', // warning-strong
  '#fbb140', // warning
  '#2dce89', // success
  '#11cdef', // info
  '#5e72e4', // primary
  '#8965e0', // accent-purple
  '#f3a4b5', // pink
]

// Pretty-print known alert types em pt-BR
const TYPE_LABELS: Record<string, string> = {
  atraso:         'Atraso',
  parada_longa:   'Parada longa',
  desvio_rota:    'Desvio de rota',
  sem_sinal:      'Sem sinal',
  velocidade:     'Excesso de velocidade',
  geofence_entry: 'Entrada em zona',
  geofence_exit:  'Saída de zona',
}

function prettyType(t: string): string {
  return TYPE_LABELS[t] ?? t
}

/**
 * Doughnut chart com distribuição de alertas por tipo (CONTEXT D-01.4).
 * Re-mount em troca de tema via key={isDark}.
 */
export function AlertasDistribuicaoChart({ data, isLoading }: Props) {
  const { isDark } = useThemeStore()
  const labels  = data.map(d => prettyType(d.type))
  const counts  = data.map(d => d.count)
  const colors  = data.map((_, i) => PALETTE[i % PALETTE.length] ?? '#5e72e4')
  const fgColor = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)'

  return (
    <PanelCard title="Distribuição de Alertas" subtitle="por tipo">
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
          <Doughnut
            key={`${isDark}-dist`}
            data={{
              labels,
              datasets: [{
                data:            counts,
                backgroundColor: colors,
                borderColor:     isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.8)',
                borderWidth:     2,
              }],
            }}
            options={{
              responsive:          true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'bottom' as const,
                  labels:   { color: fgColor, font: { size: 11 }, boxWidth: 10, padding: 8 },
                },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const total = counts.reduce((a, b) => a + b, 0)
                      const pct   = total > 0 ? (ctx.parsed / total) * 100 : 0
                      return `${ctx.label}: ${ctx.parsed} (${pct.toFixed(1)}%)`
                    },
                  },
                },
              },
            }}
          />
        )}
      </div>
    </PanelCard>
  )
}
