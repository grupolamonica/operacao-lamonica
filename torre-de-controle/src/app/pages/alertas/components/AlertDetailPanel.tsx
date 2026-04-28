import { Hand, FileEdit, Phone, ArrowUpCircle, CheckCircle2 } from 'lucide-react'
import { SidePanelLayout } from '@/components/domain/SidePanelLayout'
import { SeverityBadge } from '@/components/domain/SeverityBadge'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatDate, formatRelative } from '@/lib/formatters'
import type { Alert } from '@/data/types'

interface Props {
  alert: Alert
  onClose: () => void
}

export function AlertDetailPanel({ alert, onClose }: Props) {
  const handle = (action: string) => () => console.log(`[alert ${alert.id}] ${action}`)

  return (
    <SidePanelLayout
      title={alert.title}
      subtitle={`Alerta #${alert.id.toUpperCase()} · ${alert.tripCode}`}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          <Button size="sm" className="w-full bg-[#0f62fe] hover:bg-[#0353d9] text-xs gap-2" onClick={handle('assumir')}>
            <Hand className="h-3.5 w-3.5" /> Assumir alerta
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handle('registrar_tratativa')}>
              <FileEdit className="h-3.5 w-3.5" /> Registrar tratativa
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handle('ligar')}>
              <Phone className="h-3.5 w-3.5" /> Ligar para motorista
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={handle('escalar')}>
              <ArrowUpCircle className="h-3.5 w-3.5" /> Escalar alerta
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1.5 text-green-700 border-green-300 hover:bg-green-50" onClick={handle('resolver')}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como resolvido
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <SeverityBadge severity={alert.severity} size="md" />
          <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-xs font-medium capitalize">
            {alert.status.replace('_', ' ')}
          </span>
          <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-medium">
            {alert.source}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <Field label="Abertura" value={formatDate(alert.occurredAt, 'dd/MM HH:mm')} />
          <Field label="Tempo em andamento" value={formatRelative(alert.occurredAt)} />
          <Field label="Origem do alerta" value={alert.source} />
          <Field label="Prioridade" value={alert.severity} capitalize />
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">Detalhes</h4>
          <div className="space-y-2 text-xs text-gray-700">
            <Row label="Entrega/Rota" value={`${alert.tripCode} · ${alert.routeCode}`} />
            <Row label="Cliente"       value={alert.clientName} />
            {alert.delayMinutes !== undefined && <Row label="Desvio ETA" value={`+${alert.delayMinutes} min`} highlight="text-red-600" />}
            {alert.deviationKm !== undefined  && <Row label="Desvio rota" value={`${alert.deviationKm.toFixed(1)} km`} highlight="text-orange-600" />}
            {alert.lat && alert.lng && <Row label="Local" value={`${alert.lat.toFixed(4)}, ${alert.lng.toFixed(4)}`} mono />}
            <Row label="Descrição" value={alert.description} />
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="text-xs font-semibold text-gray-900 mb-2 uppercase tracking-wide">Motorista</h4>
          <div className="flex items-center gap-3">
            <DriverAvatar name={alert.driverName} photoUrl={alert.driverPhoto} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{alert.driverName}</p>
              <p className="text-xs text-gray-500 font-mono">{alert.plate}</p>
            </div>
          </div>
        </div>

        {alert.slaDeadline && (
          <>
            <Separator />
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-yellow-700">Prazo SLA da tratativa</p>
              <p className="text-sm text-yellow-900 mt-0.5">{formatDate(alert.slaDeadline, 'dd/MM HH:mm')} ({formatRelative(alert.slaDeadline)})</p>
            </div>
          </>
        )}
      </div>
    </SidePanelLayout>
  )
}

function Field({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-medium text-gray-900 ${capitalize ? 'capitalize' : ''}`}>{value}</p>
    </div>
  )
}

function Row({ label, value, highlight, mono }: { label: string; value: string; highlight?: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className={`text-right ${highlight ?? 'text-gray-900'} ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
