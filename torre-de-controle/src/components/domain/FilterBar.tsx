import * as React from 'react'
import { Filter, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/**
 * Reusable header filter kit (PHASE: filtros no topo).
 *
 * `FilterBar` é o padrão de posicionamento — uma linha de controles alinhada no
 * header da página, no mesmo lugar do filtro de dias do Insights
 * (`<header>…<div className="ml-auto"><FilterBar>…</FilterBar></div></header>`).
 * Os controles (`SelectFilter`, `MultiSelectFilter`, `DateRangeFilter`) são
 * genéricos e reutilizáveis em qualquer tela.
 */
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>
}

export interface SelectOption {
  value: string
  label: string
}

/** Single-select dropdown with an "all" sentinel option. */
export function SelectFilter({
  value,
  onChange,
  options,
  allLabel = 'Todos',
  placeholder,
  width = 'w-[170px]',
}: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  allLabel?: string
  placeholder?: string
  width?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className={cn('h-9', width)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Multi-select checklist in a dropdown (count badge + Resetar/Limpar). Used for
 *  the occurrence-ignore filter; generic for any "select many strings" filter. */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  onReset,
  icon: Icon = Filter,
  countNoun = 'selecionada',
  width = 'w-80',
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  onReset?: () => void
  icon?: typeof Filter
  countNoun?: string
  width?: string
}) {
  const count = selected.length
  const toggle = (o: string) =>
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 text-xs">
          <Icon className="h-3.5 w-3.5" />
          {label}
          {count > 0 && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {count} {countNoun}{count > 1 ? 's' : ''}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn('max-h-80 overflow-y-auto', width)}>
        <div
          className="flex items-center justify-between px-2 py-1.5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-xs font-medium">{label}</span>
          <div className="flex gap-1">
            {onReset && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px]"
                onClick={(e) => { e.preventDefault(); onReset() }}
              >
                <RotateCcw className="h-3 w-3" /> Resetar
              </Button>
            )}
            {count > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px]"
                onClick={(e) => { e.preventDefault(); onChange([]) }}
              >
                <X className="h-3 w-3" /> Limpar
              </Button>
            )}
          </div>
        </div>
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o}
            checked={selected.includes(o)}
            onCheckedChange={() => toggle(o)}
            onSelect={(e) => e.preventDefault()}
            className="text-xs"
          >
            {o}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Two native date inputs (período). No popover/calendar dep needed. */
export function DateRangeFilter({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
}) {
  const inputCls =
    'h-9 rounded-md border border-input bg-transparent px-2 text-xs text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
  return (
    <div className="flex items-center gap-1">
      <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} title="Período: de" className={inputCls} />
      <span className="text-xs text-muted-foreground">→</span>
      <input type="date" value={to} onChange={(e) => onTo(e.target.value)} title="Período: até" className={inputCls} />
    </div>
  )
}
