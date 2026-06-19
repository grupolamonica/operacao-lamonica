import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, CheckCheck, UserCheck } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertItem } from '@/components/domain/AlertItem'
import { DriverAvatar } from '@/components/domain/DriverAvatar'
import { SeverityBadge } from '@/components/domain/SeverityBadge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/stores/useUIStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { shouldBlinkAlert } from '@/lib/alertBlink'
import type { Alert, AlertSeverity, AlertType } from '@/data/types'

interface Props {
  alerts: Alert[]
}

const sevRank: Record<AlertSeverity, number> = { critico: 0, medio: 1, baixo: 2 }

// Rótulos curtos por tipo de ticket (para o resumo da viagem).
const tipoLabel: Record<string, string> = {
  atraso: 'Atraso', adiantado: 'Adiantado', parada: 'Parada', sem_sinal: 'Sem sinal', sem_gps: 'Sem GPS',
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
  const [confirm, setConfirm] = useState<{ ids: string[]; quem: string; lh: string } | null>(null)
  const qc = useQueryClient()
  const uid = useAuthStore((s) => s.user?.id)

  // Assumir TODAS as ocorrências ativas (não minhas) da viagem de uma vez → operador corrente.
  const assumirViagem = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (api.api.alerts as any)['assign-bulk'].post({ ids })
      if (error) throw new Error('Falha ao assumir a viagem')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['alert-stats'] })
      qc.invalidateQueries({ queryKey: ['operators-online'] })
      setConfirm(null)
    },
  })

  // Ativos = não resolvidos/encerrados. Divide por dono p/ identificar e permitir troca de turno.
  const ativos = (g: TripGroup) => g.alerts.filter(a => a.status !== 'resolvido' && a.status !== 'encerrado')
  const donoOutros = (g: TripGroup) => [...new Set(ativos(g).filter(a => a.assignedTo && a.assignedTo !== uid).map(a => a.assignedToName).filter(Boolean) as string[])]
  const semDono = (g: TripGroup) => ativos(g).filter(a => !a.assignedTo).length
  const meus = (g: TripGroup) => ativos(g).filter(a => a.assignedTo === uid).length
  const assumiveisIds = (g: TripGroup) => ativos(g).filter(a => a.assignedTo !== uid).map(a => a.id)

  function onAssumir(g: TripGroup) {
    const outros = donoOutros(g)
    if (outros.length > 0) {
      // Troca de turno: outra pessoa está tratando → avisa antes de assumir também.
      setConfirm({ ids: assumiveisIds(g), quem: outros.join(', '), lh: g.lh || g.code || g.driverName })
    } else {
      assumirViagem.mutate(assumiveisIds(g))
    }
  }

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
              {(() => {
                const outros = donoOutros(g)
                const nSemDono = semDono(g)
                const nMeus = meus(g)
                const podeAssumir = nSemDono + (outros.length > 0 ? ativos(g).filter(a => a.assignedTo && a.assignedTo !== uid).length : 0) > 0
                return (
                  <div className="flex items-center gap-2 shrink-0">
                    {nSemDono > 0 && (
                      <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-danger/15 text-danger">{nSemDono} a tratar</span>
                    )}
                    {outros.length > 0 && (
                      <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-warning/15 text-warning inline-flex items-center gap-1" title={`Em tratativa por ${outros.join(', ')}`}>
                        <UserCheck className="h-3 w-3" /> {outros.join(', ')}
                      </span>
                    )}
                    {nMeus > 0 && outros.length === 0 && (
                      <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-success/15 text-success">você está tratando</span>
                    )}
                    <span className="text-[11px] text-muted-foreground">{g.alerts.length} ocorr.</span>
                    {podeAssumir && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onAssumir(g) }}
                        disabled={assumirViagem.isPending}
                        className="inline-flex items-center gap-1 text-[11px] font-medium rounded-md px-2 py-1 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
                        title={outros.length > 0 ? `${outros.join(', ')} está tratando — assumir também (troca de turno)` : 'Assumir as ocorrências desta viagem'}
                      >
                        <CheckCheck className="h-3.5 w-3.5" /> Assumir viagem
                      </button>
                    )}
                  </div>
                )
              })()}
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
                    blink={shouldBlinkAlert(a)}
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

      {/* Aviso de troca de turno — outra pessoa está tratando a viagem agora */}
      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-warning" /> Viagem já está sendo tratada
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{confirm?.quem}</strong> está tratando as ocorrências desta viagem
            {confirm?.lh ? <> (<span className="font-mono">{confirm.lh}</span>)</> : null} neste momento.
            Se você está em <strong className="text-foreground">troca de turno</strong>, pode assumir também — os tickets passam para você e a tratativa anterior fica registrada.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>Cancelar</Button>
            <Button size="sm" disabled={assumirViagem.isPending} onClick={() => confirm && assumirViagem.mutate(confirm.ids)}>
              {assumirViagem.isPending ? 'Assumindo…' : 'Assumir também'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
