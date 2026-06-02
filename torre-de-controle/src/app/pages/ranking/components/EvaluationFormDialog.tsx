import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useRankingTrips, useEvaluateTrip, useCanWriteRanking } from '@/hooks/useRanking'
import { fixMojibake } from '@/lib/mojibake'

/**
 * EvaluationFormDialog — wired write form (Phase 9, plan 09-06).
 *
 * Submits via useEvaluateTrip (POST /api/ranking/evaluations).
 * Role-gated by useCanWriteRanking: admin|supervisor see an enabled Salvar;
 * analyst|viewer see a read-only notice with all inputs + Salvar disabled.
 *
 * operador is REMOVED from the submit payload — resolved server-side from the JWT
 * (09-03 resolveOperador, T-09-23).
 *
 * The in-dialog "Bloquear" button is REMOVED: manual block lives in BloqueiosTab
 * (Task 2 / 09-06) to avoid two entry points. NO-SHOW checkbox (atendeu=false)
 * triggers the server-side auto-block (D-09-02) — no separate front call needed.
 *
 * Primitives reused from Phase 8 shell:
 *   - <input type="range"> for ajuste_manual (no shadcn Slider installed)
 *   - <textarea> native with Input CSS classes for observacao (no shadcn Textarea)
 */

interface EvaluationFormDialogProps {
  /** Id da trip em avaliacao; null = modal fechado / sem trip. */
  tripId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** classes do Input do Torre, reaproveitadas no <textarea> nativo. */
const textareaClass =
  'flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs ' +
  'outline-none transition-[color,box-shadow] placeholder:text-muted-foreground ' +
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'

export function EvaluationFormDialog({ tripId, open, onOpenChange }: EvaluationFormDialogProps) {
  const { data: trips } = useRankingTrips()
  const trip = tripId ? trips.find((t) => t.id === tripId) : undefined

  const evaluateTrip = useEvaluateTrip()
  const canWrite = useCanWriteRanking()

  // Controlled form state
  const [comunicacao, setComunicacao] = useState('BOA')
  const [desvio, setDesvio] = useState('NENHUM')
  const [postura, setPostura] = useState('OK')
  const [noShow, setNoShow] = useState(false)
  const [ajuste, setAjuste] = useState(0)
  const [observacao, setObservacao] = useState('')

  const headerSub = trip
    ? `${fixMojibake(trip.driverName)} — ${trip.data || '—'}`
    : ''

  function onSave() {
    if (!trip) return
    const payload = {
      trip_id: trip.id,
      driver_id: trip.driver_id,
      driver_name: trip.driverName,
      comunicacao: comunicacao as 'BOA' | 'REGULAR' | 'RUIM',
      atendeu: !noShow,
      desvio_rota: desvio as 'NENHUM' | 'LEVE' | 'GRAVE',
      postura: postura as 'OK' | 'RUIM',
      ajuste_manual: ajuste,
      observacao: observacao || undefined,
    }
    evaluateTrip.mutate(payload, {
      onSuccess: () => onOpenChange(false),
    })
  }

  const readOnly = !canWrite

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{trip?.evaluated ? 'Editar Avaliação' : 'Avaliar Viagem'}</DialogTitle>
          {headerSub && <DialogDescription>{headerSub}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Comunicação</Label>
              <Select value={comunicacao} onValueChange={setComunicacao} disabled={readOnly}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOA">Boa (+5)</SelectItem>
                  <SelectItem value="REGULAR">Regular (0)</SelectItem>
                  <SelectItem value="RUIM">Ruim (-10)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Desvio de Rota</Label>
              <Select value={desvio} onValueChange={setDesvio} disabled={readOnly}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NENHUM">Nenhum (0)</SelectItem>
                  <SelectItem value="LEVE">Leve (-10)</SelectItem>
                  <SelectItem value="GRAVE">Grave (-20)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Postura</Label>
              <Select value={postura} onValueChange={setPostura} disabled={readOnly}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OK">OK (0)</SelectItem>
                  <SelectItem value="RUIM">Ruim (-10)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Checkbox
                id="no-show"
                checked={noShow}
                onCheckedChange={(c) => setNoShow(c === true)}
                disabled={readOnly}
              />
              <Label htmlFor="no-show" className="text-xs">
                NO-SHOW
                {noShow && (
                  <span className="font-semibold text-destructive"> — Irá BLOQUEAR o motorista</span>
                )}
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ajuste" className="text-xs">
              Ajuste Manual:{' '}
              <span className="font-mono font-bold">{ajuste >= 0 ? `+${ajuste}` : ajuste}</span>
            </Label>
            <input
              id="ajuste"
              type="range"
              min={-20}
              max={20}
              step={1}
              value={ajuste}
              onChange={(e) => setAjuste(Number(e.target.value))}
              className="w-full accent-primary disabled:opacity-50"
              disabled={readOnly}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>-20</span><span>0</span><span>+20</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacao" className="text-xs">Observação</Label>
            <textarea
              id="observacao"
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Detalhes adicionais sobre a viagem…"
              className={textareaClass}
              disabled={readOnly}
            />
          </div>

          {readOnly && (
            <div
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground"
              style={{ background: 'var(--accent)' }}
            >
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              <span>Somente leitura — seu perfil não permite escrita.</span>
            </div>
          )}

          {evaluateTrip.isError && (
            <p className="text-xs text-destructive">
              {evaluateTrip.error?.message ?? 'Erro ao salvar avaliação.'}
            </p>
          )}
        </div>

        <DialogFooter>
          <div className="flex gap-2 w-full justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="gradient-primary"
              disabled={!canWrite || evaluateTrip.isPending}
              onClick={onSave}
            >
              {evaluateTrip.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
