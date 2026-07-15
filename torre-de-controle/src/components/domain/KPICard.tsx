import { cn } from '@/lib/utils'
import { SparklineChart } from './SparklineChart'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export type KPIColor = 'green' | 'blue' | 'orange' | 'red' | 'purple' | 'gray'

const colorMap: Record<KPIColor, string> = {
  green:  '#2dce89',
  blue:   '#5e72e4',
  orange: '#fb6340',
  red:    '#f5365c',
  purple: '#825ee4',
  gray:   '#8392ab',
}

const gradientMap: Record<KPIColor, string> = {
  green:  'linear-gradient(310deg, #2dce89 0%, #2dcecc 100%)',
  blue:   'linear-gradient(310deg, #5e72e4 0%, #825ee4 100%)',
  orange: 'linear-gradient(310deg, #fb6340 0%, #fbb140 100%)',
  red:    'linear-gradient(310deg, #f5365c 0%, #f56036 100%)',
  purple: 'linear-gradient(310deg, #5e72e4 0%, #825ee4 100%)',
  gray:   'linear-gradient(310deg, #8392ab 0%, #67748e 100%)',
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
  icon?: React.ElementType
  /** Quando presente, o card vira um botão (acessível: role/tabIndex/teclado). */
  onClick?: () => void
}

export function KPICard({
  title, value, subtitle, total, percent, trend,
  sparklineData, progressValue, color = 'blue', icon: IconComponent, onClick,
}: KPICardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendColor = trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-muted-foreground'
  const hex = colorMap[color]
  const gradient = gradientMap[color]
  const interactive = typeof onClick === 'function'

  return (
    <div
      className={cn(
        'bg-card relative',
        interactive &&
          'cursor-pointer transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
      )}
      style={{
        borderRadius: '1rem',
        boxShadow: '0 0 2rem 0 rgba(136, 152, 170, 0.15)',
        border: 'none',
        padding: '1rem',
      }}
      {...(interactive
        ? {
            role: 'button',
            tabIndex: 0,
            onClick,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            },
            'aria-label': `${title}: ${value}`,
          }
        : {})}
    >
      {/* Floating gradient icon box */}
      {IconComponent && (
        <div
          style={{
            position: 'absolute',
            top: '-1.25rem',
            right: '1rem',
            width: '48px',
            height: '48px',
            borderRadius: '0.75rem',
            background: gradient,
            boxShadow: '0 4px 6px rgba(50, 50, 93, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconComponent style={{ width: '20px', height: '20px', color: 'white' }} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <span
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: 'var(--muted-foreground)', opacity: 0.7 }}
          >
            {title}
          </span>
          {trend && !IconComponent && (
            <TrendIcon className={cn('h-3.5 w-3.5 shrink-0', trendColor)} />
          )}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <div className="flex items-baseline gap-1">
              <span
                className="text-2xl font-bold tabular-nums"
                style={{ color: 'var(--card-foreground)' }}
              >
                {value}
              </span>
              {total !== undefined && (
                <span className="text-sm text-muted-foreground">/ {total}</span>
              )}
              {percent && <span className="text-sm text-muted-foreground">{percent}</span>}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
            {trend && (
              <div className={cn('flex items-center gap-1 mt-1', trendColor)}>
                <TrendIcon className="h-3 w-3" />
              </div>
            )}
          </div>

          {sparklineData && sparklineData.length > 0 && (
            <div className="w-24 shrink-0">
              <SparklineChart data={sparklineData} color={hex} height={36} />
            </div>
          )}
        </div>

        {progressValue !== undefined && (
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-1">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(0, Math.min(100, progressValue))}%`,
                background: gradient,
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
