import { useMemo, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { DataTable } from '@/components/domain/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOpenLoads, useLoadCandidates, useAllocateLoad, useAvailableDrivers, type OpenLoad, type AvailableDriver } from '@/hooks/useCargas'

const brl = (n: number | null) => (n == null ? '—' : `R$ ${n.toLocaleString('pt-BR')}`)

/** Tela de cargas em aberto (sem motorista) + alocação (Onda C, D-14). */
export function CargasAbertasPanel() {
  const { data: loads } = useOpenLoads()
  const [selected, setSelected] = useState<OpenLoad | null>(null)

  const columns: ColumnDef<OpenLoad>[] = [
    { id: 'lh', header: 'LH', cell: ({ row }) => <span className="font-mono text-xs font-semibold text-foreground">{row.original.lh ?? '—'}</span> },
    { id: 'carregamento', header: 'Carregamento', cell: ({ row }) => <span className="text-xs text-foreground">{row.original.origem ?? '—'}</span> },
    { id: 'descarga', header: 'Descarga', cell: ({ row }) => <span className="text-xs text-foreground">{row.original.destino ?? '—'}</span> },
    { id: 'cliente', header: 'Cliente / Rota', cell: ({ row }) => <span className="text-xs text-foreground">{row.original.cliente ?? '—'}</span> },
    { id: 'veiculo', header: 'Veículo', cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.perfil ?? '—'}</span> },
    { id: 'compensacao', header: 'Compensação', cell: ({ row }) => <span className="text-xs tabular-nums text-foreground">{brl(row.original.compensacao)}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-blue-500/15 text-blue-700 dark:text-blue-200">{row.original.status}</span> },
    {
      id: 'acao', header: '', size: 130,
      cell: ({ row }) => (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelected(row.original)}>
          Alocar ({row.original.candidatesCount})
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Cargas em aberto</h3>
        <span className="text-xs text-muted-foreground">{loads.length} sem motorista</span>
      </div>
      <DataTable data={loads} columns={columns} pageSize={10} emptyMessage="Nenhuma carga em aberto." />
      {selected && <AllocateDialog load={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

const VEHICLE_TYPES = ['CARRETA', 'CARRETA_EXPRESSA', 'TRUCK', 'BITREM']

function AllocateDialog({ load, onClose }: { load: OpenLoad; onClose: () => void }) {
  const { data: candidates, isLoading } = useLoadCandidates(load.id)
  const { data: available, isLoading: loadingAvail } = useAvailableDrivers()
  const allocate = useAllocateLoad()
  // Phase 14b — alocação sem digitar CPF/telefone: o operador ESCOLHE da lista
  // de motoristas disponíveis; placas continuam editáveis (pode trocar o conjunto).
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<AvailableDriver | null>(null)
  const [plates, setPlates] = useState({ horsePlate: '', trailerPlate: '' })
  const [vehicleType, setVehicleType] = useState(load.perfil ?? 'CARRETA')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available.slice(0, 50)
    return available.filter(d => d.name.toLowerCase().includes(q)).slice(0, 50)
  }, [available, query])

  const pick = (d: AvailableDriver) => {
    setPicked(d)
    setPlates({ horsePlate: d.horsePlate ?? '', trailerPlate: d.trailerPlate ?? '' })
    if (d.vehicleType) setVehicleType(d.vehicleType)
  }

  const doAllocate = (body: Parameters<typeof allocate.mutate>[0]['body']) =>
    allocate.mutate({ loadId: load.id, body })

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Alocar motorista — LH {load.lh ?? '—'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{load.origem} → {load.destino} · {load.cliente} · {load.perfil} · {brl(load.compensacao)}</p>
        </div>

        {/* Candidatos */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">Candidatos ({candidates.length})</p>
          {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
          {!isLoading && candidates.length === 0 && <p className="text-xs text-muted-foreground">Nenhum candidato. Escolha um motorista disponível abaixo.</p>}
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {candidates.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                <div className="min-w-0">
                  <p className="text-xs text-foreground truncate">{c.nome ?? c.cpf ?? '—'}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{c.horsePlate} · {c.trailerPlate} · {c.vehicleType}</p>
                </div>
                <Button size="sm" className="h-7 text-xs" disabled={allocate.isPending} onClick={() => doAllocate({ leadId: c.id })}>
                  Alocar
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Motoristas disponíveis (sem viagem em andamento) */}
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold text-foreground">Motoristas disponíveis ({available.length})</p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder="Buscar motorista pelo nome..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {loadingAvail && <p className="text-xs text-muted-foreground">Carregando disponíveis…</p>}
          <div className="space-y-1.5 max-h-44 overflow-y-auto">
            {filtered.map((d) => (
              <button
                key={d.cpf}
                type="button"
                onClick={() => pick(d)}
                className={`w-full flex items-center justify-between gap-2 rounded-md border p-2 text-left transition-colors ${
                  picked?.cpf === d.cpf ? 'border-primary/50 bg-primary/10' : 'border-border hover:bg-accent'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs text-foreground truncate">{d.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {[d.vinculo, d.horsePlate, d.trailerPlate].filter(Boolean).join(' · ') || 'sem veículo conhecido'}
                  </p>
                </div>
                {picked?.cpf === d.cpf && <span className="text-[10px] font-semibold text-primary shrink-0">selecionado</span>}
              </button>
            ))}
            {!loadingAvail && filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">Nenhum motorista disponível com esse nome.</p>
            )}
          </div>

          {picked && (
            <div className="space-y-2 rounded-md border border-border bg-muted/40 p-2">
              <p className="text-xs text-foreground font-medium">{picked.name}{picked.phone ? ` · ${picked.phone}` : ''}</p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="h-8 rounded border border-border bg-background px-2 text-xs font-mono"
                  placeholder="Placa cavalo"
                  value={plates.horsePlate}
                  onChange={(e) => setPlates({ ...plates, horsePlate: e.target.value })}
                />
                <input
                  className="h-8 rounded border border-border bg-background px-2 text-xs font-mono"
                  placeholder="Placa carreta"
                  value={plates.trailerPlate}
                  onChange={(e) => setPlates({ ...plates, trailerPlate: e.target.value })}
                />
                <Select value={vehicleType} onValueChange={setVehicleType}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Veículo" /></SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map(v => <SelectItem key={v} value={v}>{v.replace('_', ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                className="h-7 text-xs w-full"
                disabled={allocate.isPending || !plates.horsePlate}
                onClick={() => doAllocate({
                  cpf: picked.cpf,
                  phone: picked.phone ?? undefined,
                  horsePlate: plates.horsePlate,
                  trailerPlate: plates.trailerPlate || undefined,
                  vehicleType,
                })}
              >
                {allocate.isPending ? 'Alocando…' : `Alocar ${picked.name.split(' ')[0]} nesta carga`}
              </Button>
            </div>
          )}
        </div>

        {allocate.isError && <p className="text-xs text-danger">{(allocate.error as Error)?.message}</p>}
        {allocate.isSuccess && <p className="text-xs text-success">Alocado com sucesso no Cargas.</p>}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
