import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useOperatorPresence } from '@/hooks/useOperators'

// Phase 12 — Fila de Operadores com presença REAL (heartbeat), substitui o mock.
// Online = last_seen_at dentro da janela (90s). "Em atendimento" = tem ticket ativo.

const roleLabel: Record<string, string> = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  analyst: 'Analista',
  viewer: 'Visualizador',
}

export function OperatorsQueue({ className }: { className?: string }) {
  const { online } = useOperatorPresence()

  return (
    <div className={cn('bg-card border border-border rounded-lg p-4 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Fila de operadores</h3>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-[#2dce89] inline-block" /> {online.length} online
        </span>
      </div>

      {online.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum operador online.</p>
      ) : (
        <ul className="space-y-2">
          {online.map((op) => {
            const initials = op.name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]?.toUpperCase()).join('')
            const busy = op.ticketsAtivos > 0
            return (
              <li key={op.id} className="flex items-center gap-3 py-1.5">
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-secondary text-foreground text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <span
                    className={cn(
                      'absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-card',
                      busy ? 'bg-[#fb6340]' : 'bg-[#2dce89]',
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{op.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {busy ? 'Em atendimento' : 'Disponível'} · {roleLabel[op.role] ?? op.role}
                  </p>
                </div>
                {busy && (
                  <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-2 py-0.5 tabular-nums">
                    {op.ticketsAtivos}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
