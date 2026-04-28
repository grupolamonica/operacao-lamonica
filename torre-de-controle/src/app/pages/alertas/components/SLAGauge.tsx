import { useThemeStore } from '@/stores/useThemeStore'

interface Props {
  value: number   // 0-100
  size?: number   // px
  stroke?: number
  color?: string
}

export function SLAGauge({ value, size = 64, stroke = 6, color = '#0f62fe' }: Props) {
  const { isDark } = useThemeStore()
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(100, value))
  const offset = circumference - (pct / 100) * circumference
  const bgStroke = isDark ? '#3a3a52' : '#e3e3e3'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={bgStroke} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 400ms ease' }}
        />
      </svg>
      <span className="absolute text-xs font-bold text-foreground tabular-nums">{Math.round(pct)}%</span>
    </div>
  )
}
