import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { AlertItem } from '@/components/domain/AlertItem'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAlerts } from '@/hooks/useAlerts'
import { useDashboardKPIs } from '@/hooks/useDashboardKPIs'
import type { PrazoRange } from '@/components/domain/PrazoFinalFilter'

// Phase 13 — contagem no padrão do painel (exceções abertas de viagens ATIVAS = kpis.alertas);
// clicar num ticket leva à tela de Ocorrências já com ele aberto (deep-link).
export function ExceptionsAlertsPanel({ range }: { range: PrazoRange }) {
  const navigate = useNavigate()
  const { data: alerts } = useAlerts({ status: 'aberto', inicio: range.inicio, fim: range.fim })
  const { data: k } = useDashboardKPIs(range)

  const top = [...alerts]
    .sort((a, b) => {
      const sev: Record<string, number> = { critico: 0, medio: 1, baixo: 2 }
      return sev[a.severity] - sev[b.severity]
    })
    .slice(0, 5)

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Exceções e alertas</h3>
          <Badge variant="secondary" className="text-[10px] font-semibold">{k.alertas} abertos</Badge>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => navigate('/alertas')}>
          Ver ocorrências
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-2">
        {top.map(a => (
          <AlertItem
            key={a.id}
            variant="list"
            onClick={(id) => navigate(`/alertas?alert=${id}`)}
            alert={{
              id: a.id,
              severity: a.severity,
              title: a.title,
              lh: a.lh,
              subtitle: a.tripCode,
              driverName: a.driverName,
              driverPhoto: a.driverPhoto,
              plate: a.plate,
              clientName: a.clientName,
              occurredAt: a.occurredAt,
              delayMinutes: a.delayMinutes,
            }}
          />
        ))}
        {top.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma exceção aberta.</p>}
      </div>
    </div>
  )
}
