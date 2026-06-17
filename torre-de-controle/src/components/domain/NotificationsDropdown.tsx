import { useMemo, useState } from 'react'
import { Bell, BellOff, ChevronRight, CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from '@/components/ui/dropdown-menu'
import { AlertItem } from '@/components/domain/AlertItem'
import { useAlerts } from '@/hooks/useAlerts'
import { useMe, useMarkNotificationsSeen } from '@/hooks/useUsers'
import type { Alert, AlertType, AlertSeverity } from '@/data/types'

// Rótulo do tipo de alerta — mesma tabela da página de Ocorrências.
const tipoLabel: Record<string, string> = {
  atraso: 'Atraso', adiantado: 'Adiantado', parada: 'Parada', sem_sinal: 'Sem sinal', sem_gps: 'Sem GPS',
  prazo_proximo: 'Prazo próximo', proximo_entrega: 'Próx. entrega', manual: 'Manual',
}
const fmtTipo = (t: AlertType | string) => tipoLabel[t] ?? String(t).replace(/_/g, ' ')

// Crítico → médio → baixo; depois mais recente primeiro.
const sevRank: Record<AlertSeverity, number> = { critico: 0, medio: 1, baixo: 2 }
const MAX_ITEMS = 8

export function NotificationsDropdown() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  // Abertas = não tratadas → é o que o sino sinaliza. Atualiza sozinho (20s) pelo hook.
  const { data: alerts } = useAlerts({ status: 'aberto' })
  const { data: me } = useMe()
  const markSeen = useMarkNotificationsSeen()

  // "Não-lida" = ocorrência aberta posterior ao seenAt (marcar-como-lida do usuário).
  const seenMs = me?.notificationPreferences?.seenAt ? Date.parse(me.notificationPreferences.seenAt) : 0
  const isUnread = (a: Alert) => new Date(a.occurredAt).getTime() > seenMs

  const ordered = useMemo(
    () =>
      [...alerts].sort(
        (a, b) =>
          (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9) ||
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      ),
    [alerts],
  )
  const openCount = ordered.length
  const unread = ordered.filter(isUnread)
  const unreadCount = unread.length
  const hasUnreadCritico = unread.some((a) => a.severity === 'critico')
  const top = ordered.slice(0, MAX_ITEMS)

  function goTo(path: string) {
    setOpen(false)
    navigate(path)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative p-2 rounded-lg transition-colors outline-none"
          style={{ color: 'white' }}
          aria-label={unreadCount > 0 ? `Notificações: ${unreadCount} não lida(s)` : 'Notificações'}
          title="Notificações"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center">
              {hasUnreadCritico && (
                <span
                  className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
                  style={{ background: '#f5365c' }}
                />
              )}
              <span
                className="relative inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-none text-white"
                style={{ background: '#f5365c', boxShadow: '0 0 0 2px var(--sidebar, #1a1f37)' }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-[360px] p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-3.5 py-3 border-b border-border">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">Notificações</p>
            <p className="text-[11px] text-muted-foreground">
              {openCount === 0
                ? 'Tudo em dia'
                : `${openCount} aberta${openCount > 1 ? 's' : ''}${unreadCount > 0 ? ` · ${unreadCount} nova${unreadCount > 1 ? 's' : ''}` : ''}`}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markSeen.mutate()}
              disabled={markSeen.isPending}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-60 shrink-0"
              title="Marcar todas como lidas"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Marcar lidas
            </button>
          )}
        </div>

        {/* Lista */}
        <div className="max-h-[400px] overflow-y-auto p-2 space-y-2">
          {openCount === 0 ? (
            <div className="px-3 py-10 flex flex-col items-center text-center gap-2">
              <span className="flex items-center justify-center h-11 w-11 rounded-full bg-muted">
                <BellOff className="h-5 w-5 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium text-foreground">Nenhuma ocorrência aberta</p>
              <p className="text-[11px] text-muted-foreground">As novas ocorrências aparecem aqui.</p>
            </div>
          ) : (
            top.map((a: Alert) => (
              <div key={a.id} className="relative rounded-md overflow-hidden">
                {/* Acento azul = não-lida (nova desde a última vez que marcou como lida) */}
                {isUnread(a) && (
                  <span className="absolute left-0 top-0 bottom-0 w-1 z-10" style={{ background: '#5e72e4' }} />
                )}
                <AlertItem
                  variant="list"
                  onClick={(id) => goTo(`/alertas?alert=${id}`)}
                  alert={{
                    id: a.id,
                    severity: a.severity,
                    title: `${fmtTipo(a.type)} · ${a.title}`,
                    lh: a.lh,
                    driverName: a.driverName,
                    driverPhoto: a.driverPhoto,
                    plate: a.plate,
                    clientName: a.clientName,
                    occurredAt: a.occurredAt,
                    delayMinutes: a.delayMinutes,
                  }}
                />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <button
          onClick={() => goTo('/alertas')}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-primary border-t border-border hover:bg-accent transition-colors"
        >
          {openCount > MAX_ITEMS ? `Ver todas (${openCount})` : 'Ver todas as ocorrências'}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
