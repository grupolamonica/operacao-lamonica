import { cn } from '@/lib/utils'
import { SparklineChart } from './SparklineChart'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export type KPIColor = 'green' | 'blue' | 'orange' | 'red' | 'purple' | 'gray'

const colorMap: Record<KPIColor, string> = {
  green:  '#2dce89',
  blue:   '#0f62fe',
  orange: '#fb6340',
  red:    '#f5365c',
  purple: '#9b59b6',
  gray:   '#95959e',
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
  const trendColor = trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-muted-foreground'
  const hex = colorMap[color]

  return (
    <div className="bg-card rounded-lg shadow-md p-4 flex flex-col gap-2 border border-border hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
        {trend && <TrendIcon className={cn('h-3.5 w-3.5', trendColor)} />}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-foreground tabular-nums">{value}</span>
            {total !== undefined && (
              <span className="text-sm text-muted-foreground">/ {total}</span>
            )}
            {percent && <span className="text-sm text-muted-foreground">{percent}</span>}
          </div>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>

        {sparklineData && sparklineData.length > 0 && (
          <div className="w-24 shrink-0">
            <SparklineChart data={sparklineData} color={hex} height={36} />
          </div>
        )}
      </div>

      {progressValue !== undefined && (
        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mt-1">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.max(0, Math.min(100, progressValue))}%`, backgroundColor: hex }}
          />
        </div>
      )}
    </div>
  )
}
