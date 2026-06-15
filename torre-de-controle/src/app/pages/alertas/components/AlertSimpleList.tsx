import { useMemo } from 'react'
import { UserCheck, Clock } from 'lucide-react'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { formatRelativeWall } from '@/lib/formatters'
import { useUIStore } from '@/stores/useUIStore'
import { cn } from '@/lib/utils'
import type { Alert, AlertSeverity, AlertType } from '@/data/types'

// Visão SIMPLES das ocorrências (estilo "Tickets e Alertas" do painel GAS):
// cards enxutos, agrupados por status, cor por severidade, clique abre o detalhe.
// Sem KPIs/funil — feito para o operador bater o olho e agir rápido.

const tipoLabel: Record<string, string> = {
  atraso: 'Atraso', parada: 'Parada', sem_sinal: 'Sem sinal', sem_gps: 'Sem GPS',
  prazo_proximo: 'Prazo próximo', proximo_entrega: 'Próx. entrega', manual: 'Manual', ok: 'OK',
}
const fmtTipo = (t: AlertType | string) => tipoLabel[t] ?? String(t).replace(/_/g, ' ')

const sevRank: Record<AlertSeverity, number> = { critico: 0, medio: 1, baixo: 2 }
const sevBorder: Record<AlertSeverity, string> = {
  critico: 'border-l-danger', medio: 'border-l-warning', baixo: 'border-l-success',
}
const sevDot: Record<AlertSeverity, string> = {
  critico: 'bg-danger', medio: 'bg-warning', baixo: 'bg-success',
}

const SECTIONS: { key: string; label: string; tone: string; match: (a: Alert) => boolean }[] = [
  { key: 'tratar',   label: 'A tratar',     tone: 'text-danger',  match: (a) => a.status === 'aberto' || a.status === 'em_analise' },
  { key: 'tratando', label: 'Em tratativa', tone: 'text-warning', match: (a) => a.status === 'em_tratativa' },
  { key: 'resolvido',label: 'Resolvidas',   tone: 'text-success', match: (a) => a.status === 'resolvido' || a.status === 'encerrado' },
]

export function AlertSimpleList({ alerts }: { alerts: Alert[] }) {
  const { selectedAlertId, setSelectedAlertId } = useUIStore()

  const sections = useMemo(() => SECTIONS.map((s) => ({
    ...s,
    items: alerts
      .filter(s.match)
      .sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
  })), [alerts])

  if (alerts.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
        Nenhuma ocorrência no período.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {sections.map((sec) => sec.items.length > 0 && (
        <div key={sec.key}>
          <div className="flex items-center gap-2 mb-2 px-1">
            <h3 className={cn('text-xs font-bold uppercase tracking-wide', sec.tone)}>{sec.label}</h3>
            <span className="text-[11px] text-muted-foreground tabular-nums">({sec.items.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {sec.items.map((a) => {
              const meta = [a.lh && `LH ${a.lh}`, a.clientName].filter(Boolean).join(' · ')
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedAlertId(a.id)}
                  className={cn(
                    'text-left bg-card border border-border border-l-[3px] rounded-lg p-3 hover:bg-accent transition-colors',
                    sevBorder[a.severity],
                    selectedAlertId === a.id && 'ring-2 ring-primary/40',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={cn('h-2 w-2 rounded-full shrink-0', sevDot[a.severity])} />
                    <span className="text-sm font-semibold text-foreground truncate flex-1">{fmtTipo(a.type)}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <Clock className="h-3 w-3" /> {formatRelativeWall(a.occurredAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <DriverAvatar name={a.driverName} photoUrl={a.driverPhoto} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{a.driverName || '—'}</p>
                      {meta && <p className="text-[11px] text-muted-foreground truncate">{meta}</p>}
                    </div>
                  </div>
                  {a.assignedToName && (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-warning">
                      <UserCheck className="h-3 w-3" /> {a.assignedToName}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
