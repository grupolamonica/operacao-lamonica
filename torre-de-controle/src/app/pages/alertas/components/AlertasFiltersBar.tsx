import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useAlerts } from '@/hooks/useAlerts'
import type { AlertFilters, AlertType } from '@/data/types'

const typeLabels: Record<string, string> = {
  atraso:          'Atraso',
  parada:          'Parada',
  sem_sinal:       'Sem sinal GPS',
  prazo_proximo:   'Prazo próximo',
  proximo_entrega: 'Próximo da entrega',
}

// Só os alertas que o script do painel (verificarECriarTickets) gera — os mesmos que
// piscam: ATRASO, PARADA, SEM_GPS(→sem_sinal), PRAZO_PROXIMO, PROXIMO_ENTREGA.
// Fora: OK (marca "resolvido", não alerta) e 'manual' (aberto pelo operador, não vem do script).
const SCRIPT_ALERT_TYPES: AlertType[] = ['atraso', 'parada', 'sem_sinal', 'prazo_proximo', 'proximo_entrega']

interface Props {
  filters: AlertFilters
  onChange: (next: AlertFilters) => void
}

export function AlertasFiltersBar({ filters, onChange }: Props) {
  const { data: all } = useAlerts()
  // Radix Select.Item proíbe value="" → filtra vazios (alertas sem cliente/rota crashavam a tela)
  const nonEmpty = (x: string | null | undefined): x is string => Boolean(x && x.trim())
  const clients = Array.from(new Set(all.map(a => a.clientName).filter(nonEmpty))).sort()
  const routes = Array.from(new Set(all.map(a => a.routeCode).filter(nonEmpty))).sort()
  // Responsável = operadores que ASSUMIRAM ocorrências (tickets de viagens). Mostra o NOME
  // (assignedToName), mas filtra pelo assignedTo (uuid). Antes listava o uuid cru (bug).
  const assigneeMap = new Map<string, string>()
  for (const a of all) {
    if (nonEmpty(a.assignedTo)) assigneeMap.set(a.assignedTo, nonEmpty(a.assignedToName) ? a.assignedToName : a.assignedTo)
  }
  const assignees = Array.from(assigneeMap.entries()).sort((x, y) => x[1].localeCompare(y[1]))

  const set = <K extends keyof AlertFilters>(key: K, value: AlertFilters[K] | undefined) =>
    onChange({ ...filters, [key]: value })

  return (
    <div className="bg-card border border-border rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <Filter label="Tipo de alerta">
        <Select value={filters.type ?? '__all'} onValueChange={(v) => set('type', v === '__all' ? undefined : v as AlertType)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos</SelectItem>
            {SCRIPT_ALERT_TYPES.map(t => <SelectItem key={t} value={t}>{typeLabels[t]}</SelectItem>)}
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
            {assignees.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Filter>

    </div>
  )
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
