import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/domain/DataTable'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useAllocatedLoads, useDeallocateLoad, type AllocatedLoad } from '@/hooks/useCargas'

/** Cargas já alocadas (com motorista) + ação de DESALOCAR (cancela o lead ativo). */
export function CargasAlocadasPanel() {
  const { data: loads } = useAllocatedLoads()
  const [selected, setSelected] = useState<AllocatedLoad | null>(null)

  const columns: ColumnDef<AllocatedLoad>[] = [
    { id: 'lh', header: 'LH', cell: ({ row }) => <span className="font-mono text-xs font-semibold text-foreground">{row.original.lh ?? '—'}</span> },
    { id: 'motorista', header: 'Motorista', cell: ({ row }) => <span className="text-xs text-foreground">{row.original.driverName ?? row.original.cpf ?? '—'}</span> },
    { id: 'rota', header: 'Rota', cell: ({ row }) => <span className="text-xs text-muted-foreground">{[row.original.origem, row.original.destino].filter(Boolean).join(' → ') || '—'}</span> },
    { id: 'cliente', header: 'Cliente', cell: ({ row }) => <span className="text-xs text-foreground">{row.original.cliente ?? '—'}</span> },
    { id: 'veiculo', header: 'Veículo', cell: ({ row }) => <span className="text-xs text-muted-foreground font-mono">{[row.original.horsePlate, row.original.trailerPlate].filter(Boolean).join(' · ') || '—'}</span> },
    { id: 'status', header: 'Status', cell: ({ row }) => <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200">{row.original.status}</span> },
    {
      id: 'acao', header: '', size: 120,
      cell: ({ row }) => (
        <Button
          size="sm" variant="outline" className="h-7 text-xs"
          disabled={!row.original.leadId}
          title={row.original.leadId ? 'Desalocar (cancela o lead ativo)' : 'Sem lead cancelável'}
          onClick={() => setSelected(row.original)}
        >
          Desalocar
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Cargas alocadas</h3>
        <span className="text-xs text-muted-foreground">{loads.length} com motorista</span>
      </div>
      <DataTable data={loads} columns={columns} pageSize={10} emptyMessage="Nenhuma carga alocada." />
      {selected && <DeallocateDialog load={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function DeallocateDialog({ load, onClose }: { load: AllocatedLoad; onClose: () => void }) {
  const deallocate = useDeallocateLoad()

  const confirm = () =>
    deallocate.mutate(
      { loadId: load.id, leadId: load.leadId ?? undefined },
      { onSuccess: () => setTimeout(onClose, 800) },
    )

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Desalocar motorista — LH {load.lh ?? '—'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 text-sm">
          <p className="text-foreground font-medium">{load.driverName ?? load.cpf ?? '—'}</p>
          <p className="text-xs text-muted-foreground">{[load.origem, load.destino].filter(Boolean).join(' → ')} · {load.cliente ?? '—'}</p>
          <p className="text-xs text-muted-foreground pt-1">Cancela o lead ativo desta carga e a reabre (volta para "em aberto").</p>
        </div>
        {deallocate.isError && <p className="text-xs text-danger">{(deallocate.error as Error)?.message}</p>}
        {deallocate.isSuccess && <p className="text-xs text-success">Desalocado — carga reaberta.</p>}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={deallocate.isPending || !load.leadId} onClick={confirm}>
            {deallocate.isPending ? 'Desalocando…' : 'Confirmar desalocação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
