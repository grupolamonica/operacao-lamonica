import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { DataTable } from '@/components/domain/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  useAssignableTrips,
  useAssignableDrivers,
  useAssignTrip,
  type AssignableTrip,
  type SpxAssignableDriver,
} from '@/hooks/useAlocacaoSpx'

/** Alocação de motorista direto na VIAGEM SPX (linehaul) — caminho do sidecar. */
export function AlocacaoSpxPanel() {
  const { data: trips, isLoading } = useAssignableTrips()
  const [selected, setSelected] = useState<AssignableTrip | null>(null)

  const columns: ColumnDef<AssignableTrip>[] = [
    { id: 'trip', header: 'Viagem (LH)', cell: ({ row }) => <span className="font-mono text-xs font-semibold text-foreground">{row.original.trip_number}</span> },
    { id: 'origem', header: 'Origem', cell: ({ row }) => <span className="text-xs text-foreground">{row.original.origem ?? '—'}</span> },
    { id: 'destino', header: 'Destino', cell: ({ row }) => <span className="text-xs text-foreground">{row.original.destino ?? '—'}</span> },
    { id: 'veiculo', header: 'Tipo veículo', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.vehicle_type || '—'}</span> },
    {
      id: 'acao', header: '', size: 110,
      cell: ({ row }) => (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelected(row.original)}>
          Atribuir
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Alocação de viagens (SPX)</h3>
        <span className="text-xs text-muted-foreground">{isLoading ? 'carregando…' : `${trips.length} aguardando motorista`}</span>
      </div>
      <DataTable data={trips} columns={columns} pageSize={10} emptyMessage="Nenhuma viagem aguardando motorista." />
      {selected && <AssignDialog trip={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function AssignDialog({ trip, onClose }: { trip: AssignableTrip; onClose: () => void }) {
  const { data: drivers, isLoading } = useAssignableDrivers()
  const assign = useAssignTrip()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<SpxAssignableDriver | null>(null)
  const [plates, setPlates] = useState({ cavalo: '', carreta: '' })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q ? drivers.filter((d) => d.name.toLowerCase().includes(q)) : drivers
    return base.slice(0, 50)
  }, [drivers, query])

  const result = assign.data
  const sent = result?.enviado_ao_aspx === true
  const forcedDry = result?.forcedDryRun === true

  const doAssign = () => {
    if (!picked) return
    assign.mutate({
      tripId: trip.trip_id,
      driverIds: [picked.driver_id],
      vehiclePlates: [plates.cavalo, plates.carreta].map((p) => p.trim().toUpperCase()).filter(Boolean),
    })
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atribuir motorista — {trip.trip_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{trip.origem ?? '—'} → {trip.destino ?? '—'} · {trip.vehicle_type || 'tipo n/d'}</p>
        </div>

        {/* Motoristas atribuíveis (dropdown do aspx) */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">Motoristas atribuíveis ({drivers.length})</p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder="Buscar motorista pelo nome..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {isLoading && <p className="text-xs text-muted-foreground">Carregando motoristas…</p>}
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            {filtered.map((d) => (
              <button
                key={d.driver_id}
                type="button"
                onClick={() => setPicked(d)}
                className={`w-full flex items-center justify-between gap-2 rounded-md border p-2 text-left transition-colors ${
                  picked?.driver_id === d.driver_id ? 'border-primary/50 bg-primary/10' : 'border-border hover:bg-accent'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs text-foreground truncate">{d.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">driver_id {d.driver_id}</p>
                </div>
                {picked?.driver_id === d.driver_id && <span className="text-[10px] font-semibold text-primary shrink-0">selecionado</span>}
              </button>
            ))}
            {!isLoading && filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">Nenhum motorista com esse nome.</p>
            )}
          </div>
        </div>

        {/* Veículo (cavalo + carreta) */}
        {picked && (
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-2">
            <p className="text-xs text-foreground font-medium">{picked.name}</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="h-8 rounded border border-border bg-background px-2 text-xs font-mono uppercase"
                placeholder="Placa cavalo"
                value={plates.cavalo}
                onChange={(e) => setPlates({ ...plates, cavalo: e.target.value })}
              />
              <input
                className="h-8 rounded border border-border bg-background px-2 text-xs font-mono uppercase"
                placeholder="Placa carreta"
                value={plates.carreta}
                onChange={(e) => setPlates({ ...plates, carreta: e.target.value })}
              />
            </div>
            <Button
              size="sm"
              className="h-7 text-xs w-full"
              disabled={assign.isPending || !plates.cavalo.trim()}
              onClick={doAssign}
            >
              {assign.isPending ? 'Atribuindo…' : `Atribuir ${picked.name.split(' ')[0]} nesta viagem`}
            </Button>
          </div>
        )}

        {assign.isError && <p className="text-xs text-danger">{(assign.error as Error)?.message}</p>}
        {assign.isSuccess && sent && <p className="text-xs text-success">Atribuído no aspx ✓ (motorista + veículo enviados).</p>}
        {assign.isSuccess && forcedDry && (
          <p className="text-xs text-amber-600 dark:text-amber-300">Dry-run: SPX_ALLOC_WRITE_ENABLED está desligado — requisição montada mas NÃO enviada ao aspx.</p>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
