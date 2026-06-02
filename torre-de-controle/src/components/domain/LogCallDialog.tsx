import { useState } from 'react'
import { Phone, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useLogCommunication, type CommScope, type Outcome } from '@/hooks/useCommunications'

const OUTCOMES: Array<{ id: Outcome; label: string; tone: string }> = [
  { id: 'atendida',     label: 'Atendida',      tone: 'bg-success/15 text-success border-success/40' },
  { id: 'nao_atendida', label: 'Não atendida',  tone: 'bg-warning/15 text-warning border-warning/40' },
  { id: 'caixa_postal', label: 'Caixa postal',  tone: 'bg-muted text-muted-foreground border-border' },
]

interface Props {
  scope:    CommScope
  open:     boolean
  onClose:  () => void
  phone?:   string | null
}

export function LogCallDialog({ scope, open, onClose, phone }: Props) {
  const [outcome,  setOutcome ] = useState<Outcome>('atendida')
  const [duration, setDuration] = useState<string>('60')
  const [notes,    setNotes   ] = useState('')
  const log = useLogCommunication(scope)

  function handleSubmit() {
    if (log.isPending) return
    log.mutate(
      {
        channel:     'call',
        direction:   'out',
        outcome,
        durationSec: outcome === 'atendida' ? Math.max(0, Number(duration) || 0) : undefined,
        content:     notes.trim() || undefined,
      },
      { onSuccess: () => { setNotes(''); setDuration('60'); onClose() } },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4 text-primary" /> Registrar ligação
          </DialogTitle>
        </DialogHeader>

        {phone && (
          <p className="text-xs text-muted-foreground">
            Telefone: <strong className="text-foreground font-mono">{phone}</strong>
          </p>
        )}

        <div className="space-y-3 mt-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Resultado</p>
            <div className="grid grid-cols-3 gap-1.5">
              {OUTCOMES.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOutcome(o.id)}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                    outcome === o.id ? o.tone : 'bg-card border-border text-foreground hover:bg-accent',
                  )}
                >{o.label}</button>
              ))}
            </div>
          </div>

          {outcome === 'atendida' && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Duração (segundos)</p>
              <input
                type="number"
                min={0}
                max={86400}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full text-sm rounded-md border border-border bg-background px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Anotações</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="O que o motorista relatou? Próximos passos?"
              className="w-full text-xs rounded-md border border-border bg-background px-2 py-1.5 resize-none outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <DialogFooter className="mt-3">
          <Button size="sm" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSubmit} disabled={log.isPending} className="gap-1.5">
            {log.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
