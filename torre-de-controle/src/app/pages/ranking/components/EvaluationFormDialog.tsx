import { useState } from 'react'
import { ShieldAlert, Lock } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useRankingTrips } from '@/hooks/useRanking'
import { fixMojibake } from '@/lib/mojibake'

/**
 * EvaluationFormDialog — shell do formulario de avaliacao (PHASE8-MODAIS-SHELL,
 * 08-05 / Wave 3).
 *
 * Recria a UI do `EvaluationForm` do ride-rank no design Torre (shadcn Dialog),
 * com TODOS os campos montados e controlados (comunicacao, desvio, postura,
 * no-show, ajuste manual, operador, observacao). E um SHELL: "Salvar" e "Bloquear"
 * ficam DESABILITADOS com aviso de Phase 9 e NENHUM handler chama a API. Read-only
 * — zero POST/PATCH/DELETE (D-V2-03 / 08-CONTEXT; threat T-08-09 → submit
 * desabilitado elimina acao nao rastreada). A escrita (avaliar/bloquear + log de
 * auditoria) entra na Phase 9 plugando os handlers neste mesmo componente.
 *
 * Substituicoes de primitives (o Torre nao tem switch/slider/textarea shadcn —
 * decisao: nao introduzir 3 primitives so para um shell read-only):
 *   - Switch   → shadcn Checkbox (existe no Torre) + Label.
 *   - Slider   → `<input type="range">` nativo (min -20 / max +20 / step 1) + valor.
 *   - Textarea → `<textarea>` nativo com as classes Tailwind do Input do Torre.
 *
 * @see C:\...\ride-rank-buddy\src\components\EvaluationForm.tsx — campos originais
 */

interface EvaluationFormDialogProps {
  /** Id da trip em avaliacao; null = modal fechado / sem trip. */
  tripId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PHASE9_NOTICE = 'Edição/avaliação será habilitada na Phase 9 (somente leitura nesta fase).'
const PHASE9_TITLE = 'Disponível na Phase 9'

/** classes do Input do Torre, reaproveitadas no <textarea> nativo. */
const textareaClass =
  'flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs ' +
  'outline-none transition-[color,box-shadow] placeholder:text-muted-foreground ' +
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'

export function EvaluationFormDialog({ tripId, open, onOpenChange }: EvaluationFormDialogProps) {
  const { data: trips } = useRankingTrips()
  const trip = tripId ? trips.find((t) => t.id === tripId) : undefined

  // Estado local controlado (UI pura — nada e persistido nesta fase).
  const [comunicacao, setComunicacao] = useState('BOA')
  const [desvio, setDesvio] = useState('NENHUM')
  const [postura, setPostura] = useState('OK')
  const [noShow, setNoShow] = useState(false)
  const [ajuste, setAjuste] = useState(0)
  const [operador, setOperador] = useState('')
  const [observacao, setObservacao] = useState('')

  const headerSub = trip
    ? `${fixMojibake(trip.driverName)} — ${trip.data || '—'}`
    : ''

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
              <Select value={comunicacao} onValueChange={setComunicacao}>
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
              <Select value={desvio} onValueChange={setDesvio}>
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
              <Select value={postura} onValueChange={setPostura}>
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
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>-20</span><span>0</span><span>+20</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="operador" className="text-xs">Operador</Label>
            <Input
              id="operador"
              value={operador}
              onChange={(e) => setOperador(e.target.value)}
              placeholder="Nome do operador"
            />
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
            />
          </div>

          <div
            className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground"
            style={{ background: 'var(--accent)' }}
          >
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>{PHASE9_NOTICE}</span>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="destructive"
            className="gap-1"
            disabled
            title={PHASE9_TITLE}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Bloquear
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled title={PHASE9_TITLE}>
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
