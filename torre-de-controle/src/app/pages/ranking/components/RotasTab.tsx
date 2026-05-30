import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, ShieldAlert } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/domain/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  useRankingRouteScores,
  useRankingTrips,
  useCreateRouteScore,
  useUpdateRouteScore,
  useDeleteRouteScore,
  useCanWriteRanking,
  type RouteScoreRecord,
  type RouteScoreCreateInput,
} from '@/hooks/useRanking'
import { fixMojibake } from '@/lib/mojibake'
import { formatDate } from '@/lib/formatters'

/**
 * RotasTab — aba Rotas (PHASE8-TAB-ROTAS, wired Phase 9 plan 09-07).
 *
 * CRUD completo (create/update/delete) via mutation hooks (useCreateRouteScore,
 * useUpdateRouteScore, useDeleteRouteScore), role-gated (admin|supervisor) via
 * useCanWriteRanking (D-09-10). analyst|viewer veem a tabela read-only.
 *
 * T-09-26: role gate é UX — requireRole server-side é o controle real.
 * T-09-28: edit/delete desabilitados para rows sem id real (fallback sintético).
 */

/** Linha da tabela: RouteScoreRecord + id estavel garantido. */
type RouteRow = RouteScoreRecord & { id: string }

interface RouteFormState {
  origin_code: string
  destination_code: string
  pontuacao: string
  data_inicio: string
  data_fim: string
  observacao: string
}

const EMPTY_FORM: RouteFormState = {
  origin_code: '',
  destination_code: '',
  pontuacao: '1',
  data_inicio: new Date().toISOString().split('T')[0],
  data_fim: '',
  observacao: '',
}

/** True when the row has a real backend uuid (not the synthetic fallback). */
function hasRealId(row: RouteRow): boolean {
  const synthetic = `${row.origin_code}-${row.destination_code}-${row.data_inicio}`
  return row.id !== synthetic
}

export function RotasTab() {
  const { data: routeScores, isLoading, isError } = useRankingRouteScores()
  const { data: trips } = useRankingTrips()
  const canWrite = useCanWriteRanking()

  const createRoute = useCreateRouteScore()
  const updateRoute = useUpdateRouteScore()
  const deleteRoute = useDeleteRouteScore()

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RouteFormState>(EMPTY_FORM)

  // Contagem de viagens por rota (origin->destination), como no ride-rank.
  const tripCountByRoute = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of trips) {
      if (!t.origin_code || !t.destination_code) continue
      const key = `${t.origin_code}→${t.destination_code}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [trips])

  // id estavel: id? do backend ou fallback deterministico (origem-destino-inicio).
  const data = useMemo<RouteRow[]>(
    () =>
      routeScores.map((rs) => ({
        ...rs,
        id: rs.id ?? `${rs.origin_code}-${rs.destination_code}-${rs.data_inicio}`,
      })),
    [routeScores],
  )

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(row: RouteRow) {
    setEditingId(row.id)
    setForm({
      origin_code: row.origin_code,
      destination_code: row.destination_code,
      pontuacao: String(row.pontuacao),
      data_inicio: row.data_inicio,
      data_fim: row.data_fim ?? '',
      observacao: row.observacao ?? '',
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function handleSave() {
    const pontuacao = parseFloat(form.pontuacao)
    if (Number.isNaN(pontuacao)) return
    if (!form.origin_code.trim() || !form.destination_code.trim()) return

    const payload: RouteScoreCreateInput = {
      origin_code: form.origin_code.toUpperCase().trim(),
      destination_code: form.destination_code.toUpperCase().trim(),
      pontuacao,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim || null,
      observacao: form.observacao || null,
    }

    if (editingId) {
      updateRoute.mutate({ id: editingId, ...payload }, { onSuccess: closeDialog })
    } else {
      createRoute.mutate(payload, { onSuccess: closeDialog })
    }
  }

  function handleDelete(row: RouteRow) {
    if (!hasRealId(row)) return
    if (!window.confirm(`Remover a pontuação de rota ${row.origin_code} → ${row.destination_code}?`)) return
    deleteRoute.mutate(row.id)
  }

  const isPending = createRoute.isPending || updateRoute.isPending
  const mutationError =
    (createRoute.isError ? createRoute.error?.message : null) ??
    (updateRoute.isError ? updateRoute.error?.message : null) ??
    (deleteRoute.isError ? deleteRoute.error?.message : null)

  const columns = useMemo<ColumnDef<RouteRow, unknown>[]>(
    () => {
      const cols: ColumnDef<RouteRow, unknown>[] = [
        {
          id: 'origin_code',
          header: 'Origem',
          cell: ({ row }) => (
            <span className="font-mono text-xs font-medium">{row.original.origin_code}</span>
          ),
        },
        {
          id: 'destination_code',
          header: 'Destino',
          cell: ({ row }) => (
            <span className="font-mono text-xs font-medium">{row.original.destination_code}</span>
          ),
        },
        {
          id: 'viagens',
          header: 'Viagens',
          cell: ({ row }) => {
            const key = `${row.original.origin_code}→${row.original.destination_code}`
            return (
              <span className="block text-right font-mono tabular-nums text-muted-foreground">
                {tripCountByRoute.get(key) ?? 0}
              </span>
            )
          },
        },
        {
          id: 'pontuacao',
          header: 'Pontuação',
          cell: ({ row }) => (
            <Badge variant="default" className="font-mono text-xs">
              {row.original.pontuacao} pt
            </Badge>
          ),
        },
        {
          id: 'periodo',
          header: 'Período',
          cell: ({ row }) => (
            <span className="font-mono text-xs text-muted-foreground">
              {row.original.data_inicio ? formatDate(row.original.data_inicio, 'dd/MM/yyyy') : '—'}
              {row.original.data_fim ? ` → ${formatDate(row.original.data_fim, 'dd/MM/yyyy')}` : ' → atual'}
            </span>
          ),
        },
        {
          id: 'observacao',
          header: 'Obs.',
          cell: ({ row }) => {
            const obs = fixMojibake(row.original.observacao)
            return (
              <span className="block max-w-[220px] truncate text-xs text-muted-foreground" title={obs}>
                {obs || '—'}
              </span>
            )
          },
        },
      ]

      // Ação column: only rendered when canWrite (D-09-10)
      if (canWrite) {
        cols.push({
          id: 'acoes',
          header: 'Ações',
          cell: ({ row }) => {
            const realId = hasRealId(row.original)
            const disabledTitle = realId ? undefined : 'Registro sem id real — recarregue para editar/remover'
            return (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={!realId}
                  title={disabledTitle ?? 'Editar'}
                  onClick={() => openEdit(row.original)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  disabled={!realId || deleteRoute.isPending}
                  title={disabledTitle ?? 'Remover'}
                  onClick={() => handleDelete(row.original)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )
          },
        })
      }

      return cols
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tripCountByRoute, canWrite, deleteRoute.isPending],
  )

  const subtitle = isLoading
    ? 'Carregando…'
    : isError
      ? 'Falha ao carregar'
      : `${routeScores.length} rotas`

  // Toolbar: Nova Pontuação enabled only for admin|supervisor (D-09-10)
  const toolbar = canWrite ? (
    <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openCreate}>
      <Plus className="h-3.5 w-3.5" />
      Nova Pontuação
    </Button>
  ) : null

  return (
    <>
      <DataTable<RouteRow>
        data={data}
        columns={columns}
        toolbar={toolbar}
        title="Rotas"
        subtitle={subtitle}
        emptyMessage={
          isLoading
            ? 'Carregando rotas…'
            : isError
              ? 'Não foi possível carregar as rotas.'
              : 'Nenhuma pontuação de rota cadastrada.'
        }
      />

      {/* Route-score create/edit dialog (admin|supervisor only — canWrite guard at render) */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Pontuação de Rota' : 'Nova Pontuação de Rota'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Origem</Label>
                <Input
                  value={form.origin_code}
                  onChange={(e) => setForm((f) => ({ ...f, origin_code: e.target.value }))}
                  placeholder="Ex: GRU"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Destino</Label>
                <Input
                  value={form.destination_code}
                  onChange={(e) => setForm((f) => ({ ...f, destination_code: e.target.value }))}
                  placeholder="Ex: CWB"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Pontuação base</Label>
              <Input
                type="number"
                step="0.5"
                value={form.pontuacao}
                onChange={(e) => setForm((f) => ({ ...f, pontuacao: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground">
                Substitui o ponto base (1) por completar a viagem nesta rota.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data Início</Label>
                <Input
                  type="date"
                  value={form.data_inicio}
                  onChange={(e) => setForm((f) => ({ ...f, data_inicio: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data Fim (opcional)</Label>
                <Input
                  type="date"
                  value={form.data_fim}
                  onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Observação</Label>
              <Input
                value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                placeholder="Ex: Ajuste semanal"
              />
            </div>

            {!canWrite && (
              <div
                className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground"
                style={{ background: 'var(--accent)' }}
              >
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>Somente leitura — seu perfil não permite escrita.</span>
              </div>
            )}

            {mutationError && (
              <p className="text-xs text-destructive">{mutationError}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!canWrite || isPending}
              onClick={handleSave}
            >
              {isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
