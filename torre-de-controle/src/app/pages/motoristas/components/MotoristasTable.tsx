import { type ColumnDef } from '@tanstack/react-table'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Filter, ArrowUpDown, MoreVertical } from 'lucide-react'
import { TableWithSidePanel } from '@/components/domain/TableWithSidePanel'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { ExportButton } from '@/components/common/ExportButton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDrivers, useDriver } from '@/hooks/useDrivers'
import { useUIStore } from '@/stores/useUIStore'
import { DriverDetailPanel } from './DriverDetailPanel'
import type { Driver, DriverFilters, DriverStatus } from '@/data/types'

const statusLabel: Record<DriverStatus, { label: string; style: React.CSSProperties }> = {
  available:    { label: 'Disponível',    style: { backgroundColor: 'var(--status-no-prazo-bg)',  color: 'var(--status-no-prazo-fg)' } },
  on_route:     { label: 'Em rota',       style: { backgroundColor: 'color-mix(in oklch, var(--primary) 15%, transparent)', color: 'var(--primary)' } },
  unavailable:  { label: 'Indisponível',  style: { backgroundColor: 'var(--status-sem-sinal-bg)', color: 'var(--status-sem-sinal-fg)' } },
}

// Phase 14 — colunas pedidas: Motorista · Vínculo · Disponibilidade · Viagens · Rank
const columns: ColumnDef<Driver>[] = [
  {
    id: 'driver', header: 'Motorista', size: 260,
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
    id: 'vinculo', header: 'Vínculo',
    cell: ({ row }) => <span className="text-xs font-medium text-foreground">{row.original.vinculo ?? row.original.driverKind ?? '—'}</span>,
  },
  {
    id: 'status', header: 'Disponibilidade',
    cell: ({ row }) => {
      const c = statusLabel[row.original.status]
      return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={c.style}>{c.label}</span>
    },
  },
  {
    id: 'viagens', header: 'Viagens',
    cell: ({ row }) => <span className="text-sm tabular-nums text-foreground">{row.original.viagens ?? 0}</span>,
  },
  {
    id: 'rank', header: 'Rank',
    cell: ({ row }) => row.original.rank != null
      ? <span className="text-sm tabular-nums font-semibold text-foreground">#{row.original.rank}{row.original.pontuacao != null && <span className="text-xs text-muted-foreground font-normal"> · {row.original.pontuacao} pts</span>}</span>
      : <span className="text-xs text-muted-foreground">—</span>,
  },
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

  // Deep-link (ex.: da Auditoria): /motoristas?driver=<id> abre o motorista direto.
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const d = searchParams.get('driver')
    if (d) setSelectedDriverId(d)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

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
      <ExportButton entity="motoristas" filters={filters} className="h-9 gap-2 text-xs" />
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
