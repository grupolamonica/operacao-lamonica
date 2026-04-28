import { cn } from '@/lib/utils'

interface Props {
  value: number   // 0-100
  color?: string  // hex; default azul
  height?: number // px; default 6
  showLabel?: boolean
  className?: string
}

export function ProgressBar({ value, color = '#0f62fe', height = 6, showLabel, className }: Props) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('w-full', className)}>
      <div
        className="w-full bg-gray-100 rounded-full overflow-hidden"
        style={{ height }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span className="text-[10px] text-gray-500 mt-1">{pct.toFixed(0)}%</span>
      )}
    </div>
  )
}
