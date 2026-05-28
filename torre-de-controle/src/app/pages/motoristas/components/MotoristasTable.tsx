import { type ColumnDef } from '@tanstack/react-table'
import { useState } from 'react'
import { Search, Filter, Download, ArrowUpDown, MoreVertical, FileCheck2, FileX2, FileWarning } from 'lucide-react'
import { TableWithSidePanel } from '@/components/domain/TableWithSidePanel'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDrivers, useDriver } from '@/hooks/useDrivers'
import { useUIStore } from '@/stores/useUIStore'
import { formatDuration } from '@/lib/formatters'
import { DriverDetailPanel } from './DriverDetailPanel'
import type { Driver, DriverFilters, DriverStatus, DocStatus } from '@/data/types'

const statusLabel: Record<DriverStatus, { label: string; style: React.CSSProperties }> = {
  available:    { label: 'Disponível',    style: { backgroundColor: 'var(--status-no-prazo-bg)',  color: 'var(--status-no-prazo-fg)' } },
  on_route:     { label: 'Em rota',       style: { backgroundColor: 'color-mix(in oklch, var(--primary) 15%, transparent)', color: 'var(--primary)' } },
  unavailable:  { label: 'Indisponível',  style: { backgroundColor: 'var(--status-sem-sinal-bg)', color: 'var(--status-sem-sinal-fg)' } },
}

function delayColor(min: number) {
  if (min <= 0) return 'text-success'
  if (min < 10) return 'text-warning'
  return 'text-danger'
}

function scoreStyle(score: number): React.CSSProperties {
  if (score >= 90) return { backgroundColor: 'var(--status-no-prazo-bg)', color: 'var(--status-no-prazo-fg)' }
  if (score >= 80) return { backgroundColor: 'var(--status-em-risco-bg)', color: 'var(--status-em-risco-fg)' }
  return { backgroundColor: 'var(--status-atrasado-bg)', color: 'var(--status-atrasado-fg)' }
}

const docIconByStatus: Record<DocStatus, { Icon: typeof FileCheck2; color: string }> = {
  valido:         { Icon: FileCheck2,  color: 'text-success' },
  vence_em_breve: { Icon: FileWarning, color: 'text-warning' },
  vencido:        { Icon: FileX2,      color: 'text-danger' },
}

const columns: ColumnDef<Driver>[] = [
  {
    id: 'driver', header: 'Motorista', size: 240,
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <DriverAvatar name={row.original.name} status={row.original.status} size="md" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{row.original.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.original.plate} · {row.original.vehicleType}</p>
        </div>
      </div>
    ),
  },
  {
    id: 'status', header: 'Disponibilidade',
    cell: ({ row }) => {
      const c = statusLabel[row.original.status]
      return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={c.style}>{c.label}</span>
    },
  },
  { accessorKey: 'deliveriesToday', header: 'Entregas hoje', cell: (i) => <span className="text-sm tabular-nums text-foreground">{i.getValue<number>()}</span> },
  {
    id: 'delay', header: 'Atraso médio',
    cell: ({ row }) => <span className={`text-sm font-medium tabular-nums ${delayColor(row.original.avgDelayMinutes)}`}>{row.original.avgDelayMinutes >= 0 ? '+' : ''}{formatDuration(Math.abs(row.original.avgDelayMinutes))}</span>,
  },
  {
    id: 'score', header: 'Score',
    cell: ({ row }) => <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums" style={scoreStyle(row.original.operationalScore)}>{row.original.operationalScore}</span>,
  },
  {
    id: 'docs', header: 'Documentos',
    cell: ({ row }) => (
      <div className="flex gap-1.5">
        {row.original.documents.map(d => {
          const { Icon, color } = docIconByStatus[d.status]
          return <Icon key={d.type} className={`h-4 w-4 ${color}`} aria-label={`${d.type}: ${d.status}`} />
        })}
      </div>
    ),
  },
  { accessorKey: 'address', header: 'Localização', cell: (i) => <span className="text-xs text-muted-foreground truncate">{i.getValue<string>()}</span> },
  {
    id: 'actions', header: '', size: 40,
    cell: () => (
      <button className="p-1 rounded hover:bg-accent text-muted-foreground" onClick={(e) => e.stopPropagation()}>
        <MoreVertical className="h-4 w-4" />
      </button>
    ),
  },
]

export function MotoristasTable() {
  const [filters, setFilters] = useState<DriverFilters>({})
  const { data: drivers } = useDrivers(filters)
  const { selectedDriverId, setSelectedDriverId } = useUIStore()
  const { data: selected } = useDriver(selectedDriverId)
  const bases = ['CD São Paulo', 'CD Guarulhos', 'CD Campinas']

  const toolbar = (
    <div className="flex items-center gap-3">
      <div className="relative w-56 shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar motorista, placa ou código..."
          value={filters.search ?? ''}
          onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
          className="pl-9 h-9 text-sm"
        />
      </div>

      <Select value={filters.status ?? '__all'} onValueChange={(v) => setFilters({ ...filters, status: v === '__all' ? undefined : v as DriverStatus })}>
        <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">Todos status</SelectItem>
          <SelectItem value="available">Disponível</SelectItem>
          <SelectItem value="on_route">Em rota</SelectItem>
          <SelectItem value="unavailable">Indisponível</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.base ?? '__all'} onValueChange={(v) => setFilters({ ...filters, base: v === '__all' ? undefined : v })}>
        <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Base" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">Todas bases</SelectItem>
          {bases.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" className="h-9 gap-2 text-xs"><ArrowUpDown className="h-3.5 w-3.5" /> Ordenar</Button>
      <Button variant="outline" size="sm" className="h-9 gap-2 text-xs"><Filter className="h-3.5 w-3.5" /> Filtros</Button>
      <Button variant="outline" size="sm" className="h-9 gap-2 text-xs"><Download className="h-3.5 w-3.5" /> Exportar</Button>
    </div>
  )

  return (
    <TableWithSidePanel
      data={drivers}
      columns={columns}
      selectedItem={selected}
      onSelect={(d) => setSelectedDriverId(d?.id ?? null)}
      renderPanel={(d) => <DriverDetailPanel driver={d} onClose={() => setSelectedDriverId(null)} />}
      panelWidth={400}
      toolbar={toolbar}
    />
  )
}
