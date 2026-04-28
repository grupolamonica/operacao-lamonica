import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js'
import { useThemeStore } from '@/stores/useThemeStore'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler)

interface Props {
  data: number[]
  color?: string
  height?: number
  fill?: boolean
}

export function SparklineChart({ data, color, height = 40, fill = false }: Props) {
  const { isDark } = useThemeStore()
  const lineColor = color ?? (isDark ? '#4d94ff' : '#0f62fe')
  const fillColor = isDark ? 'rgba(77,148,255,0.15)' : 'rgba(15,98,254,0.15)'

  return (
    <div style={{ height, width: '100%', minWidth: 80 }}>
      <Line
        key={`${isDark}-${lineColor}`}
        data={{
          labels: data.map((_, i) => i.toString()),
          datasets: [{
            data,
            borderColor: lineColor,
            backgroundColor: fill ? fillColor : 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
            fill,
          }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
          scales: {
            x: { display: false },
            y: { display: false },
          },
          animation: false,
        }}
      />
    </div>
  )
}
