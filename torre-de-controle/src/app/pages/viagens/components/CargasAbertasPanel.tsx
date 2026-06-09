import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/domain/DataTable'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useOpenLoads, useLoadCandidates, useAllocateLoad, type OpenLoad } from '@/hooks/useCargas'

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

function AllocateDialog({ load, onClose }: { load: OpenLoad; onClose: () => void }) {
  const { data: candidates, isLoading } = useLoadCandidates(load.id)
  const allocate = useAllocateLoad()
  const [manual, setManual] = useState({ cpf: '', phone: '', horsePlate: '', trailerPlate: '', vehicleType: load.perfil ?? 'CARRETA' })

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
          {!isLoading && candidates.length === 0 && <p className="text-xs text-muted-foreground">Nenhum candidato. Use alocação avulsa abaixo.</p>}
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
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

        {/* Alocação avulsa */}
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold text-foreground">Alocar motorista avulso</p>
          <div className="grid grid-cols-2 gap-2">
            <input className="h-8 rounded border border-border bg-background px-2 text-xs" placeholder="CPF" value={manual.cpf} onChange={(e) => setManual({ ...manual, cpf: e.target.value })} />
            <input className="h-8 rounded border border-border bg-background px-2 text-xs" placeholder="Telefone" value={manual.phone} onChange={(e) => setManual({ ...manual, phone: e.target.value })} />
            <input className="h-8 rounded border border-border bg-background px-2 text-xs" placeholder="Placa cavalo" value={manual.horsePlate} onChange={(e) => setManual({ ...manual, horsePlate: e.target.value })} />
            <input className="h-8 rounded border border-border bg-background px-2 text-xs" placeholder="Placa carreta" value={manual.trailerPlate} onChange={(e) => setManual({ ...manual, trailerPlate: e.target.value })} />
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs w-full" disabled={allocate.isPending || !manual.cpf} onClick={() => doAllocate(manual)}>
            Alocar avulso
          </Button>
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
