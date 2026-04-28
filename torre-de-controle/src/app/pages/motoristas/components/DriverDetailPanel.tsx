import { Phone, MessageSquare, Mail, FileCheck2, FileX2, FileWarning } from 'lucide-react'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { MapPlaceholder } from '@/components/domain/MapPlaceholder'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useTrips } from '@/hooks/useTrips'
import { formatDate } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { Driver, DocStatus } from '@/data/types'

const docConfig: Record<DocStatus, { Icon: typeof FileCheck2; color: string; label: string }> = {
  valido:         { Icon: FileCheck2,  color: 'text-green-600',  label: 'Válido' },
  vence_em_breve: { Icon: FileWarning, color: 'text-yellow-600', label: 'Vence em breve' },
  vencido:        { Icon: FileX2,      color: 'text-red-600',    label: 'Vencido' },
}

const statusBadge = {
  available:   { label: 'Disponível',   classes: 'bg-green-100 text-green-700' },
  on_route:    { label: 'Em rota',       classes: 'bg-blue-100 text-blue-700' },
  unavailable: { label: 'Indisponível',  classes: 'bg-gray-100 text-gray-600' },
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
            <p className="text-sm font-medium text-gray-900">{driver.name}</p>
            <p className="text-xs text-gray-500 font-mono">{driver.plate} · {driver.vehicleType}</p>
            <p className="text-xs text-gray-500 mt-1">{driver.base}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', sb.classes)}>{sb.label}</span>
              <span className="text-xs text-gray-500">Score: <strong className="text-gray-900 tabular-nums">{driver.operationalScore}</strong></span>
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
          <h4 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">Conformidade e documentos</h4>
          <ul className="space-y-2">
            {driver.documents.map(doc => {
              const { Icon, color, label } = docConfig[doc.status]
              return (
                <li key={doc.type} className="flex items-center gap-2 text-xs">
                  <Icon className={cn('h-4 w-4', color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900">{doc.type}</p>
                    <p className="text-gray-500">{label} · validade {formatDate(doc.expiresAt, 'dd/MM/yyyy')}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">Localização atual</h4>
          <MapPlaceholder height={140} showLegend={false} />
          <p className="text-xs text-gray-600 mt-2">{driver.address}</p>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">{driver.lat.toFixed(4)}, {driver.lng.toFixed(4)}</p>
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">Últimas viagens</h4>
          {recent.length === 0 ? (
            <p className="text-xs text-gray-500">Sem viagens recentes.</p>
          ) : (
            <ul className="space-y-2">
              {recent.map(t => (
                <li key={t.id} className="flex items-center justify-between text-xs border-b border-gray-100 pb-1.5 last:border-0">
                  <div className="min-w-0">
                    <p className="font-mono text-gray-900">{t.code}</p>
                    <p className="text-gray-500 truncate">{t.clientName} · {t.destination}</p>
                  </div>
                  <span className="text-[10px] text-gray-500 shrink-0 ml-2">{t.departedAt ? formatDate(t.departedAt, 'dd/MM HH:mm') : '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SidePanelLayout>
  )
}
