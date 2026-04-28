import { cn } from '@/lib/utils'
import { SparklineChart } from './SparklineChart'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export type KPIColor = 'green' | 'blue' | 'orange' | 'red' | 'purple' | 'gray'

const colorMap: Record<KPIColor, string> = {
  green:  '#2ecc71',
  blue:   '#0f62fe',
  orange: '#f39c12',
  red:    '#e74c3c',
  purple: '#9b59b6',
  gray:   '#95a5a6',
}

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  total?: number
  percent?: string
  trend?: 'up' | 'down' | 'neutral'
  sparklineData?: number[]
  progressValue?: number
  color?: KPIColor
}

export function KPICard({
  title, value, subtitle, total, percent, trend,
  sparklineData, progressValue, color = 'blue',
}: KPICardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendColor = trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-400'
  const hex = colorMap[color]

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-2 border border-gray-100">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{title}</span>
        {trend && <TrendIcon className={cn('h-3.5 w-3.5', trendColor)} />}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-gray-900 tabular-nums">{value}</span>
            {total !== undefined && (
              <span className="text-sm text-gray-400">/ {total}</span>
            )}
            {percent && <span className="text-sm text-gray-500">{percent}</span>}
          </div>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>

        {sparklineData && sparklineData.length > 0 && (
          <div className="w-24 shrink-0">
            <SparklineChart data={sparklineData} color={hex} height={36} />
          </div>
        )}
      </div>

      {progressValue !== undefined && (
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.max(0, Math.min(100, progressValue))}%`, backgroundColor: hex }}
          />
        </div>
      )}
    </div>
  )
}
