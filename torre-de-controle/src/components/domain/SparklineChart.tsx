import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler)

interface Props {
  data: number[]
  color: string
  height?: number
  fill?: boolean
}

export function SparklineChart({ data, color, height = 40, fill = false }: Props) {
  return (
    <div style={{ height, width: '100%', minWidth: 80 }}>
      <Line
        data={{
          labels: data.map((_, i) => i.toString()),
          datasets: [{
            data,
            borderColor: color,
            backgroundColor: fill ? `${color}33` : 'transparent',
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
