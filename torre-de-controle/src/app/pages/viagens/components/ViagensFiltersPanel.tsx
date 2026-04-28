import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTrips } from '@/hooks/useTrips'
import type { TripFilters, Priority, SlaStatus } from '@/data/types'

interface Props {
  filters: TripFilters
  onChange: (next: TripFilters) => void
}

export function ViagensFiltersPanel({ filters, onChange }: Props) {
  const { data: all } = useTrips()
  const clients = Array.from(new Set(all.map(t => t.clientName))).sort()
  const operations = Array.from(new Set(all.map(t => t.operationName))).sort()
  const routes = Array.from(new Set(all.map(t => t.routeCode))).sort()

  const set = <K extends keyof TripFilters>(key: K, value: TripFilters[K] | undefined) =>
    onChange({ ...filters, [key]: value })

  return (
    <aside className="bg-white border border-gray-200 rounded-lg p-4 space-y-4 sticky top-0">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Filtros</h3>
        <p className="text-xs text-gray-500">Refinar por critérios</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Motorista (busca)</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Nome do motorista"
            value={filters.driverName ?? ''}
            onChange={(e) => set('driverName', e.target.value || undefined)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Cliente</Label>
        <Select value={filters.clientName ?? '__all'} onValueChange={(v) => set('clientName', v === '__all' ? undefined : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos</SelectItem>
            {clients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Operação</Label>
        <Select
          value={(filters as { operationName?: string }).operationName ?? '__all'}
          onValueChange={(v) => onChange({ ...filters, ...({ operationName: v === '__all' ? undefined : v } as Record<string, unknown>) } as TripFilters)}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas</SelectItem>
            {operations.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Rota</Label>
        <Select value={filters.routeCode ?? '__all'} onValueChange={(v) => set('routeCode', v === '__all' ? undefined : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas</SelectItem>
            {routes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Prioridade</Label>
        <Select value={filters.priority ?? '__all'} onValueChange={(v) => set('priority', v === '__all' ? undefined : v as Priority)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">SLA / Janela</Label>
        <Select value={filters.slaStatus ?? '__all'} onValueChange={(v) => set('slaStatus', v === '__all' ? undefined : v as SlaStatus)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos</SelectItem>
            <SelectItem value="no_prazo">No prazo</SelectItem>
            <SelectItem value="em_risco">Em risco</SelectItem>
            <SelectItem value="atrasado">Atrasado</SelectItem>
            <SelectItem value="sem_sinal">Sem sinal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <button
        onClick={() => onChange({})}
        className="text-xs text-[#0f62fe] hover:underline"
      >
        Limpar filtros
      </button>
    </aside>
  )
}
