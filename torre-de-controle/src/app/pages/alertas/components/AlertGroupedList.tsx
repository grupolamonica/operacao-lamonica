import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, CheckCheck } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertItem } from '@/components/domain/AlertItem'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { SeverityBadge } from '@/components/domain/SeverityBadge'
import { useUIStore } from '@/stores/useUIStore'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Alert, AlertSeverity, AlertType } from '@/data/types'

interface Props {
  alerts: Alert[]
}

const sevRank: Record<AlertSeverity, number> = { critico: 0, medio: 1, baixo: 2 }

// Rótulos curtos por tipo de ticket (para o resumo da viagem).
const tipoLabel: Record<string, string> = {
  atraso: 'Atraso', parada: 'Parada', sem_sinal: 'Sem sinal', sem_gps: 'Sem GPS',
  prazo_proximo: 'Prazo próximo', proximo_entrega: 'Próx. entrega', manual: 'Manual',
}
const fmtTipo = (t: AlertType | string) => tipoLabel[t] ?? String(t).replace(/_/g, ' ')

interface TripGroup {
  key: string
  lh: string
  code: string
  driverName: string
  driverPhoto?: string
  clientName: string
  alerts: Alert[]
  aTratar: number       // status aberto/em_analise (ainda não assumidos)
  emTratativa: number   // já assumidos, em tratamento
  worst: AlertSeverity
  tipos: string[]
  lastAt: number
}

function buildGroups(alerts: Alert[]): TripGroup[] {
  const map = new Map<string, Alert[]>()
  for (const a of alerts) {
    // chave da viagem: tripId > LH > tripCode > o próprio alerta (sem viagem vinculada)
    const key = a.tripId || a.lh || a.tripCode || `solo:${a.id}`
    const g = map.get(key)
    if (g) g.push(a); else map.set(key, [a])
  }
  const groups: TripGroup[] = []
  for (const [key, list] of map) {
    const sorted = [...list].sort((x, y) => new Date(y.occurredAt).getTime() - new Date(x.occurredAt).getTime())
    const ref = sorted.find(a => a.lh) ?? sorted.find(a => a.driverName) ?? sorted[0]
    const worst = list.reduce<AlertSeverity>((w, a) => (sevRank[a.severity] < sevRank[w] ? a.severity : w), 'baixo')
    const aTratar = list.filter(a => a.status === 'aberto' || a.status === 'em_analise').length
    const emTratativa = list.filter(a => a.status === 'em_tratativa').length
    const tipos = [...new Set(list.map(a => fmtTipo(a.type)))]
    groups.push({
      key, lh: ref.lh, code: ref.tripCode || ref.lh, driverName: ref.driverName, driverPhoto: ref.driverPhoto,
      clientName: ref.clientName, alerts: sorted, aTratar, emTratativa, worst, tipos,
      lastAt: new Date(sorted[0].occurredAt).getTime(),
    })
  }
  // ordena: pior severidade primeiro, depois mais ocorrências, depois mais recente
  return groups.sort((a, b) =>
    sevRank[a.worst] - sevRank[b.worst] || b.alerts.length - a.alerts.length || b.lastAt - a.lastAt,
  )
}

export function AlertGroupedList({ alerts }: Props) {
  const { selectedAlertId, setSelectedAlertId } = useUIStore()
  const groups = useMemo(() => buildGroups(alerts), [alerts])
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const qc = useQueryClient()

  // Assumir TODAS as ocorrências abertas da viagem de uma vez → operador corrente.
  const assumirViagem = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (api.api.alerts as any)['assign-bulk'].post({ ids })
      if (error) throw new Error('Falha ao assumir a viagem')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['alert-stats'] })
    },
  })
  const aTratarIds = (g: TripGroup) => g.alerts.filter(a => a.status === 'aberto' || a.status === 'em_analise').map(a => a.id)

  if (groups.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
        Nenhuma ocorrência no período.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground px-1">{groups.length} viagens com ocorrências · agrupadas por viagem</p>
      {groups.map((g) => {
        const isOpen = open[g.key] ?? false
        const Chev = isOpen ? ChevronDown : ChevronRight
        const temSelecionado = g.alerts.some(a => a.id === selectedAlertId)
        return (
          <div key={g.key} className={cn('bg-card border rounded-lg overflow-hidden', temSelecionado ? 'border-primary/40' : 'border-border')}>
            {/* Cabeçalho da VIAGEM — resume todos os tickets dela + assumir tudo */}
            <div
              role="button" tabIndex={0}
              onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen((o) => ({ ...o, [g.key]: !isOpen })) }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left cursor-pointer"
            >
              <Chev className="h-4 w-4 text-muted-foreground shrink-0" />
              <SeverityBadge severity={g.worst} />
              <DriverAvatar name={g.driverName} photoUrl={g.driverPhoto} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {g.lh && <span className="text-xs font-mono font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">LH {g.lh}</span>}
                  <span className="text-sm font-medium text-foreground truncate">{g.driverName || g.code || '—'}</span>
                  {g.clientName && <span className="text-xs text-muted-foreground">· {g.clientName}</span>}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{g.tipos.join(' · ')}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {g.aTratar > 0 && (
                  <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-danger/15 text-danger">{g.aTratar} a tratar</span>
                )}
                {g.emTratativa > 0 && (
                  <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-info/15 text-info">{g.emTratativa} em tratativa</span>
                )}
                <span className="text-[11px] text-muted-foreground">{g.alerts.length} ocorr.</span>
                {g.aTratar > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); assumirViagem.mutate(aTratarIds(g)) }}
                    disabled={assumirViagem.isPending}
                    className="inline-flex items-center gap-1 text-[11px] font-medium rounded-md px-2 py-1 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
                    title={`Assumir as ${g.aTratar} ocorrências a tratar desta viagem`}
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> Assumir viagem
                  </button>
                )}
              </div>
            </div>

            {/* Tickets da viagem (todos juntos) */}
            {isOpen && (
              <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                {g.alerts.map((a) => (
                  <AlertItem
                    key={a.id}
                    variant="list"
                    onClick={(id) => setSelectedAlertId(id)}
                    selected={selectedAlertId === a.id}
                    alert={{
                      id: a.id, severity: a.severity,
                      title: `${fmtTipo(a.type)} · ${a.title}`,
                      driverName: a.driverName, driverPhoto: a.driverPhoto, plate: a.plate,
                      clientName: a.clientName, occurredAt: a.occurredAt, delayMinutes: a.delayMinutes,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
