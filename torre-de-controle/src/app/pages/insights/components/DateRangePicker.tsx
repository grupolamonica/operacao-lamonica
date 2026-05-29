import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Range } from '@/hooks/useInsights'

interface Props {
  value:    Range
  onChange: (range: Range) => void
}

/**
 * Range preset selector for InsightsPage — 7d / 30d / 90d (CONTEXT D-02).
 * Default 30d. Controlled via URL ?range= in parent page so links are
 * shareable. No custom range picker in MVP scope.
 */
export function DateRangePicker({ value, onChange }: Props) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Range)}>
      <SelectTrigger className="h-9 w-[160px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="7d">Últimos 7 dias</SelectItem>
        <SelectItem value="30d">Últimos 30 dias</SelectItem>
        <SelectItem value="90d">Últimos 90 dias</SelectItem>
      </SelectContent>
    </Select>
  )
}
