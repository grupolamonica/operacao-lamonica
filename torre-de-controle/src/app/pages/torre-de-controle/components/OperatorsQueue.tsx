import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useOperatorPresence, useOperatorTickets } from '@/hooks/useOperators'

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
  const [aberto, setAberto] = useState<string | null>(null)

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
        <ul className="space-y-1">
          {online.map((op) => {
            const initials = op.name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]?.toUpperCase()).join('')
            const busy = op.ticketsAtivos > 0
            const isOpen = aberto === op.id
            const Chev = isOpen ? ChevronDown : ChevronRight
            return (
              <li key={op.id}>
                {/* clicar mostra os tickets que o operador está tratando */}
                <button
                  onClick={() => setAberto(isOpen ? null : op.id)}
                  className="w-full flex items-center gap-3 py-1.5 px-1 rounded-md hover:bg-accent transition-colors text-left"
                >
                  {busy ? <Chev className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <span className="w-3.5 shrink-0" />}
                  <div className="relative">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-secondary text-foreground text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <span className={cn('absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-card', busy ? 'bg-[#fb6340]' : 'bg-[#2dce89]')} />
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
                </button>
                {isOpen && busy && <OperatorTickets operatorId={op.id} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Tickets que o operador está tratando (expande sob o operador na fila). */
function OperatorTickets({ operatorId }: { operatorId: string }) {
  const navigate = useNavigate()
  const { data: tickets, isLoading } = useOperatorTickets(operatorId)
  const sevColor: Record<string, string> = { critico: 'bg-danger', medio: 'bg-warning', baixo: 'bg-success' }
  if (isLoading) return <p className="text-xs text-muted-foreground pl-12 py-1">Carregando…</p>
  if (tickets.length === 0) return <p className="text-xs text-muted-foreground pl-12 py-1">Sem tickets ativos.</p>
  return (
    <ul className="pl-9 pr-1 pb-2 space-y-1">
      {tickets.map((t) => (
        <li key={t.id}>
          <button
            onClick={() => navigate(`/alertas?alert=${t.id}`)}
            className="w-full flex items-center gap-2 rounded-md border border-border p-1.5 hover:bg-accent transition-colors text-left"
          >
            <span className={cn('h-2 w-2 rounded-full shrink-0', sevColor[t.severity] ?? 'bg-muted')} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-foreground truncate">{t.title}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {[t.lh && `LH ${t.lh}`, t.motorista, t.cliente].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <span className={cn('text-[9px] rounded-full px-1.5 py-0.5 shrink-0', t.status === 'em_tratativa' ? 'bg-info/15 text-info' : 'bg-muted text-muted-foreground')}>
              {t.status === 'em_tratativa' ? 'tratativa' : 'análise'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
