import { useMemo, useState } from 'react'
import { ShieldAlert, Unlock, ShieldPlus } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { DataTable } from '@/components/domain/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useRankingBlocks,
  useUnblockDriver,
  useBlockDriver,
  useCanWriteRanking,
  type DriverBlockRecord,
} from '@/hooks/useRanking'
import { fixMojibake } from '@/lib/mojibake'
import { formatDate } from '@/lib/formatters'

/**
 * BloqueiosTab — wired write surface (Phase 9, plan 09-06).
 *
 * Unblock: useUnblockDriver (PATCH /api/ranking/blocks/:id) — row action, canWrite only.
 * Manual block: useBlockDriver (POST /api/ranking/blocks) — toolbar dialog, canWrite only.
 * Role gate: useCanWriteRanking — analyst|viewer see no write controls (D-09-10).
 * Invalidation: both hooks invalidate ['ranking', 'blocks'|'drivers'|'stats'|'logs'] (D-09-09).
 */

/** Linha da tabela: DriverBlockRecord + id estavel garantido. */
type BlockRow = DriverBlockRecord & { id: string }

/** Badge do tipo de bloqueio (NO_SHOW / MANUAL), tom mono como no ride-rank. */
function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <Badge variant="outline" className="text-[10px] font-mono">
      {tipo}
    </Badge>
  )
}

/** Badge de status do bloqueio. Todas as linhas sao ativas => BLOQUEADO (vermelho). */
function BloqueioStatusBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: 'var(--status-atrasado-bg)', color: 'var(--status-atrasado-fg)' }}
    >
      <ShieldAlert className="h-3 w-3" />
      BLOQUEADO
    </span>
  )
}

/** Dialog for manual block creation (admin|supervisor only). */
function ManualBlockDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const blockDriver = useBlockDriver()
  const [driverId, setDriverId] = useState('')
  const [driverName, setDriverName] = useState('')
  const [motivo, setMotivo] = useState('')

  function handleSubmit() {
    if (!driverId.trim() || !driverName.trim() || !motivo.trim()) return
    blockDriver.mutate(
      { driver_id: driverId.trim(), driver_name: driverName.trim(), motivo: motivo.trim() },
      {
        onSuccess: () => {
          setDriverId('')
          setDriverName('')
          setMotivo('')
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bloqueio Manual</DialogTitle>
          <DialogDescription>
            Bloquear manualmente um motorista. O motivo ficará registrado no log de auditoria.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mb-driver-id" className="text-xs">ID do Motorista</Label>
            <Input
              id="mb-driver-id"
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              placeholder="ex: DRV-123"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mb-driver-name" className="text-xs">Nome do Motorista</Label>
            <Input
              id="mb-driver-name"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="Nome completo"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mb-motivo" className="text-xs">Motivo</Label>
            <textarea
              id="mb-motivo"
              rows={3}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Descreva o motivo do bloqueio…"
              className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
            />
            <p className="text-[10px] text-muted-foreground text-right">{motivo.length}/500</p>
          </div>

          {blockDriver.isError && (
            <p className="text-xs text-destructive">
              {blockDriver.error?.message ?? 'Erro ao criar bloqueio.'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={
              blockDriver.isPending ||
              !driverId.trim() ||
              !driverName.trim() ||
              !motivo.trim()
            }
            onClick={handleSubmit}
          >
            {blockDriver.isPending ? 'Bloqueando…' : 'Bloquear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BloqueiosTab() {
  const { data: blocks, isLoading, isError } = useRankingBlocks()
  const unblockDriver = useUnblockDriver()
  const canWrite = useCanWriteRanking()
  const [manualBlockOpen, setManualBlockOpen] = useState(false)

  // id estavel: id? do backend ou fallback deterministico (driver_id + indice).
  const data = useMemo<BlockRow[]>(
    () => blocks.map((b, i) => ({ ...b, id: b.id ?? `${b.driver_id}-${i}` })),
    [blocks],
  )

  const columns = useMemo<ColumnDef<BlockRow, unknown>[]>(
    () => [
      {
        id: 'driver_name',
        header: 'Motorista',
        cell: ({ row }) => (
          <span className="font-medium">{fixMojibake(row.original.driver_name)}</span>
        ),
      },
      {
        id: 'tipo',
        header: 'Tipo',
        cell: ({ row }) => <TipoBadge tipo={row.original.tipo} />,
      },
      {
        id: 'motivo',
        header: 'Motivo',
        cell: ({ row }) => (
          <span
            className="block max-w-[220px] truncate text-muted-foreground"
            title={fixMojibake(row.original.motivo)}
          >
            {fixMojibake(row.original.motivo) || '—'}
          </span>
        ),
      },
      {
        id: 'data_inicio',
        header: 'Início',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.data_inicio ? formatDate(row.original.data_inicio) : '—'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: () => <BloqueioStatusBadge />,
      },
      {
        id: 'created_by',
        header: 'Criado por',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {fixMojibake(row.original.created_by) || '—'}
          </span>
        ),
      },
      {
        id: 'acao',
        header: 'Ação',
        cell: ({ row }) => {
          if (!canWrite) return null
          return (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              disabled={unblockDriver.isPending}
              onClick={() =>
                unblockDriver.mutate({
                  id: row.original.id,
                  driver_id: row.original.driver_id,
                  driver_name: row.original.driver_name,
                })
              }
            >
              <Unlock className="h-3 w-3" />
              Desbloquear
            </Button>
          )
        },
      },
    ],
    [canWrite, unblockDriver],
  )

  const subtitle = isLoading
    ? 'Carregando…'
    : isError
      ? 'Falha ao carregar'
      : `${blocks.length} ativos`

  const toolbar = canWrite ? (
    <Button
      size="sm"
      variant="destructive"
      className="h-8 gap-1.5 text-xs"
      onClick={() => setManualBlockOpen(true)}
    >
      <ShieldPlus className="h-3.5 w-3.5" />
      Bloqueio manual
    </Button>
  ) : undefined

  return (
    <>
      <DataTable<BlockRow>
        data={data}
        columns={columns}
        title="Bloqueios"
        subtitle={subtitle}
        toolbar={toolbar}
        emptyMessage={
          isLoading
            ? 'Carregando bloqueios…'
            : isError
              ? 'Não foi possível carregar os bloqueios.'
              : 'Nenhum bloqueio ativo'
        }
      />
      <ManualBlockDialog open={manualBlockOpen} onOpenChange={setManualBlockOpen} />
    </>
  )
}
