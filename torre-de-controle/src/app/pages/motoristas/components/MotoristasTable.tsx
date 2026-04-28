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

const statusLabel: Record<DriverStatus, { label: string; classes: string }> = {
  available:    { label: 'Disponível',    classes: 'bg-green-100 text-green-700' },
  on_route:     { label: 'Em rota',        classes: 'bg-blue-100 text-blue-700' },
  unavailable:  { label: 'Indisponível',   classes: 'bg-gray-100 text-gray-600' },
}

function delayColor(min: number) {
  if (min <= 0) return 'text-green-600'
  if (min < 10) return 'text-yellow-600'
  return 'text-red-600'
}

function scoreColor(score: number) {
  if (score >= 90) return 'bg-green-100 text-green-700'
  if (score >= 80) return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

const docIconByStatus: Record<DocStatus, { Icon: typeof FileCheck2; color: string }> = {
  valido:         { Icon: FileCheck2,  color: 'text-green-600' },
  vence_em_breve: { Icon: FileWarning, color: 'text-yellow-600' },
  vencido:        { Icon: FileX2,      color: 'text-red-600' },
}

const columns: ColumnDef<Driver>[] = [
  {
    id: 'driver', header: 'Motorista', size: 240,
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <DriverAvatar name={row.original.name} status={row.original.status} size="md" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{row.original.name}</p>
          <p className="text-xs text-gray-500 font-mono">{row.original.plate} · {row.original.vehicleType}</p>
        </div>
      </div>
    ),
  },
  {
    id: 'status', header: 'Disponibilidade',
    cell: ({ row }) => {
      const c = statusLabel[row.original.status]
      return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.classes}`}>{c.label}</span>
    },
  },
  { accessorKey: 'deliveriesToday', header: 'Entregas hoje', cell: (i) => <span className="text-sm tabular-nums">{i.getValue<number>()}</span> },
  {
    id: 'delay', header: 'Atraso médio',
    cell: ({ row }) => <span className={`text-sm font-medium tabular-nums ${delayColor(row.original.avgDelayMinutes)}`}>{row.original.avgDelayMinutes >= 0 ? '+' : ''}{formatDuration(Math.abs(row.original.avgDelayMinutes))}</span>,
  },
  {
    id: 'score', header: 'Score',
    cell: ({ row }) => <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${scoreColor(row.original.operationalScore)}`}>{row.original.operationalScore}</span>,
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
  { accessorKey: 'address', header: 'Localização', cell: (i) => <span className="text-xs text-gray-600 truncate">{i.getValue<string>()}</span> },
  {
    id: 'actions', header: '', size: 40,
    cell: () => (
      <button className="p-1 rounded hover:bg-gray-100" onClick={(e) => e.stopPropagation()}>
        <MoreVertical className="h-4 w-4 text-gray-500" />
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
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

      <TableWithSidePanel
        data={drivers}
        columns={columns}
        selectedItem={selected}
        onSelect={(d) => setSelectedDriverId(d?.id ?? null)}
        renderPanel={(d) => <DriverDetailPanel driver={d} onClose={() => setSelectedDriverId(null)} />}
        panelWidth={400}
      />
    </div>
  )
}
