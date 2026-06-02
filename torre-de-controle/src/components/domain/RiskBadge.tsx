import { cn } from '@/lib/utils'
import type { RiskLevel } from '@/data/types'

interface Props {
  level: RiskLevel | null | undefined
  score?: number | null
  size?: 'sm' | 'md'
  showScore?: boolean
}

const TONE: Record<RiskLevel, string> = {
  baixo:   'bg-success/15 text-success',
  medio:   'bg-warning/15 text-warning',
  alto:    'bg-orange-500/15 text-orange-500',
  critico: 'bg-danger/15 text-danger',
}

const LABEL: Record<RiskLevel, string> = {
  baixo:   'Baixo',
  medio:   'Médio',
  alto:    'Alto',
  critico: 'Crítico',
}

export const RISK_HEX: Record<RiskLevel, string> = {
  baixo:   '#2dce89',
  medio:   '#fb6340',
  alto:    '#f97316',
  critico: '#f5365c',
}

export function RiskBadge({ level, score, size = 'sm', showScore = true }: Props) {
  if (!level) {
    return (
      <span className={cn(
        'inline-flex items-center rounded-full font-medium bg-muted text-muted-foreground',
        size === 'md' ? 'px-2.5 py-0.5 text-xs' : 'px-1.5 py-0 text-[10px]',
      )}>
        sem score
      </span>
    )
  }
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full font-semibold',
      TONE[level],
      size === 'md' ? 'px-2.5 py-0.5 text-xs' : 'px-1.5 py-0 text-[10px]',
    )}>
      {LABEL[level]}
      {showScore && score != null && (
        <span className="opacity-70 tabular-nums">· {score}</span>
      )}
    </span>
  )
}
