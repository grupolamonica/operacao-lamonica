import { Phone, MessageSquare, Mail, FileCheck2, FileX2, FileWarning } from 'lucide-react'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { LiveMap } from '@/components/domain/LiveMap'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useTrips } from '@/hooks/useTrips'
import { formatDate } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Driver, DocStatus } from '@/data/types'

const docConfig: Record<DocStatus, { Icon: typeof FileCheck2; color: string; label: string }> = {
  valido:         { Icon: FileCheck2,  color: 'text-success',  label: 'Válido' },
  vence_em_breve: { Icon: FileWarning, color: 'text-warning',  label: 'Vence em breve' },
  vencido:        { Icon: FileX2,      color: 'text-danger',   label: 'Vencido' },
}

const statusBadge = {
  available:   { label: 'Disponível',   style: { backgroundColor: 'var(--status-no-prazo-bg)',  color: 'var(--status-no-prazo-fg)' } },
  on_route:    { label: 'Em rota',      style: { backgroundColor: 'var(--color-primary, #0f62fe)', color: '#ffffff' } },
  unavailable: { label: 'Indisponível', style: { backgroundColor: 'var(--status-sem-sinal-bg)', color: 'var(--status-sem-sinal-fg)' } },
} as const

interface Props {
  driver: Driver
  onClose: () => void
}

export function DriverDetailPanel({ driver, onClose }: Props) {
  const { data: allTrips } = useTrips()
  const recent = allTrips
    .filter(t => t.driverId === driver.id)
    .sort((a, b) => (b.departedAt?.getTime() ?? 0) - (a.departedAt?.getTime() ?? 0))
    .slice(0, 5)

  const sb = statusBadge[driver.status]

  return (
    <SidePanelLayout
      title={driver.name}
      subtitle={`${driver.code} · ${driver.plate}`}
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <DriverAvatar name={driver.name} photoUrl={driver.photoUrl} status={driver.status} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{driver.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{driver.plate} · {driver.vehicleType}</p>
            <p className="text-xs text-muted-foreground mt-1">{driver.base}</p>
            <div className="flex items-center gap-2 mt-2">
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={sb.style}
              >
                {sb.label}
              </span>
              <span className="text-xs text-muted-foreground">Score: <strong className="text-foreground tabular-nums">{driver.operationalScore}</strong></span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" variant="outline" className="text-xs gap-1.5"><Phone className="h-3.5 w-3.5" /> Ligar</Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Mensagem</Button>
          <Button size="sm" variant="outline" className="text-xs gap-1.5"><Mail className="h-3.5 w-3.5" /> E-mail</Button>
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Conformidade e documentos</h4>
          <ul className="space-y-2">
            {driver.documents.map(doc => {
              const { Icon, color, label } = docConfig[doc.status]
              return (
                <li key={doc.type} className="flex items-center gap-2 text-xs">
                  <Icon className={cn('h-4 w-4', color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground">{doc.type}</p>
                    <p className="text-muted-foreground">{label} · validade {formatDate(doc.expiresAt, 'dd/MM/yyyy')}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Localização atual</h4>
          <LiveMap height={140} showLegend={false} />
          <p className="text-xs text-muted-foreground mt-2">{driver.address}</p>
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{driver.lat.toFixed(4)}, {driver.lng.toFixed(4)}</p>
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Últimas viagens</h4>
          {recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem viagens recentes.</p>
          ) : (
            <ul className="space-y-2">
              {recent.map(t => (
                <li key={t.id} className="flex items-center justify-between text-xs border-b border-border pb-1.5 last:border-0">
                  <div className="min-w-0">
                    <p className="font-mono text-foreground">{t.code}</p>
                    <p className="text-muted-foreground truncate">{t.clientName} · {t.destination}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{t.departedAt ? formatDate(t.departedAt, 'dd/MM HH:mm') : '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SidePanelLayout>
  )
}
