import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useAlerts } from '@/hooks/useAlerts'
import type { AlertFilters, AlertType } from '@/data/types'

const typeLabels: Record<AlertType, string> = {
  atraso_critico:          'Atraso crítico',
  desvio_nao_autorizado:   'Desvio não autorizado',
  parada_nao_planejada:    'Parada não planejada',
  sinal_gps_intermitente:  'Sinal GPS intermitente',
  tempo_parada_elevado:    'Tempo de parada elevado',
  entrega_fora_janela:     'Entrega fora da janela',
  checklist_incompleto:    'Checklist incompleto',
}

interface Props {
  filters: AlertFilters
  onChange: (next: AlertFilters) => void
}

export function AlertasFiltersBar({ filters, onChange }: Props) {
  const { data: all } = useAlerts()
  const clients = Array.from(new Set(all.map(a => a.clientName))).sort()
  const routes = Array.from(new Set(all.map(a => a.routeCode))).sort()
  const assignees = Array.from(new Set(all.map(a => a.assignedTo).filter((x): x is string => Boolean(x)))).sort()

  const set = <K extends keyof AlertFilters>(key: K, value: AlertFilters[K] | undefined) =>
    onChange({ ...filters, [key]: value })

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <Filter label="Tipo de alerta">
        <Select value={filters.type ?? '__all'} onValueChange={(v) => set('type', v === '__all' ? undefined : v as AlertType)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos</SelectItem>
            {(Object.keys(typeLabels) as AlertType[]).map(t => <SelectItem key={t} value={t}>{typeLabels[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </Filter>

      <Filter label="Cliente">
        <Select value={filters.clientName ?? '__all'} onValueChange={(v) => set('clientName', v === '__all' ? undefined : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos</SelectItem>
            {clients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </Filter>

      <Filter label="Rota">
        <Select value={filters.routeCode ?? '__all'} onValueChange={(v) => set('routeCode', v === '__all' ? undefined : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas</SelectItem>
            {routes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </Filter>

      <Filter label="Responsável">
        <Select value={filters.assignedTo ?? '__all'} onValueChange={(v) => set('assignedTo', v === '__all' ? undefined : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos</SelectItem>
            <SelectItem value="__unassigned">Não atribuído</SelectItem>
            {assignees.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </Filter>

      <Filter label="Período">
        <Select value={filters.period ?? 'today'} onValueChange={(v) => set('period', v as AlertFilters['period'])}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
      </Filter>
    </div>
  )
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-gray-500">{label}</Label>
      {children}
    </div>
  )
}
