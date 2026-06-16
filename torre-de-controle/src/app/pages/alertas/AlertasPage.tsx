import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LayoutGrid, List } from 'lucide-react'
import { AlertasKPIRow } from './components/AlertasKPIRow'
import { AlertasFiltersBar } from './components/AlertasFiltersBar'
import { AlertGroupedList } from './components/AlertGroupedList'
import { AlertSimpleList } from './components/AlertSimpleList'
import { AlertDetailPanel } from './components/AlertDetailPanel'
import { AlertasStatusBreakdown, type AlertPhase } from './components/AlertasStatusBreakdown'
import { ExportButton } from '@/components/common/ExportButton'
import { FixedPanel } from '@/components/domain/FixedPanel'
import { PrazoFinalFilter, defaultPrazoRange } from '@/components/domain/PrazoFinalFilter'
import { useAlerts, useAlert } from '@/hooks/useAlerts'
import { useUIStore } from '@/stores/useUIStore'
import { cn } from '@/lib/utils'
import type { AlertFilters, AlertStatus } from '@/data/types'

// Visão preferida do operador persiste entre sessões.
const VIEW_KEY = 'ocorrencias:view'

// status do back → fase do funil (Novas/Em tratativa/Concluídas). Mesma agregação do funil.
function phaseKeyOf(status: AlertStatus): AlertPhase {
  if (status === 'em_tratativa') return 'tratativa'
  if (status === 'resolvido' || status === 'encerrado') return 'concluida'
  return 'nova'
}

export function AlertasPage() {
  const [filters, setFilters] = useState<AlertFilters>(() => defaultPrazoRange('op')) // Prazo Final = hoje
  const [view, setView] = useState<'simples' | 'detalhada'>(
    () => (localStorage.getItem(VIEW_KEY) as 'simples' | 'detalhada') || 'simples',
  )
  const { data: alerts } = useAlerts(filters)
  // Filtro do funil por FASE (3 grupos) — client-side, pra incluir os 2 status de cada fase
  // (ex.: Concluídas = resolvido + encerrado), já que o filtro do servidor é status único.
  const [activePhase, setActivePhase] = useState<AlertPhase | null>(null)
  const shown = useMemo(
    () => (activePhase ? alerts.filter((a) => phaseKeyOf(a.status) === activePhase) : alerts),
    [alerts, activePhase],
  )
  const { selectedAlertId, setSelectedAlertId } = useUIStore()
  const { data: selected } = useAlert(selectedAlertId)
  const isOpen = selected !== null
  const simples = view === 'simples'

  function setViewPersist(v: 'simples' | 'detalhada') { setView(v); localStorage.setItem(VIEW_KEY, v) }

  // Phase 13 — deep-link do dashboard: /alertas?alert=<id> abre o ticket direto.
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const a = searchParams.get('alert')
    if (a) setSelectedAlertId(a)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Ocorrências</h1>
          <p className="text-sm text-white/70">
            {simples ? 'Tickets e alertas — visão do operador' : 'Centro operacional — funil, tratativas e SLA'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <PrazoFinalFilter
            label="Abertura"
            value={{ inicio: filters.inicio ?? null, fim: filters.fim ?? null }}
            onChange={(r) => setFilters((f) => ({ ...f, inicio: r.inicio, fim: r.fim }))}
          />
          {/* Toggle Visão simples / detalhada */}
          <div className="inline-flex rounded-md border border-white/20 overflow-hidden">
            <button
              onClick={() => setViewPersist('simples')}
              className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                simples ? 'bg-white text-slate-900' : 'text-white/80 hover:bg-white/10')}
            >
              <List className="h-3.5 w-3.5" /> Simples
            </button>
            <button
              onClick={() => setViewPersist('detalhada')}
              className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                !simples ? 'bg-white text-slate-900' : 'text-white/80 hover:bg-white/10')}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Detalhada
            </button>
          </div>
          <ExportButton entity="alertas" filters={filters} />
        </div>
      </header>

      {/* KPIs e funil só na visão detalhada — a simples é enxuta p/ o operador */}
      {!simples && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            <AlertasKPIRow />
          </div>
          <AlertasStatusBreakdown
            activePhase={activePhase}
            onSelect={setActivePhase}
          />
        </div>
      )}

      <AlertasFiltersBar filters={filters} onChange={setFilters} />

      <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0">
          {simples ? <AlertSimpleList alerts={shown} /> : <AlertGroupedList alerts={shown} />}
        </div>

        {isOpen && selected && (
          <FixedPanel width={440}>
            <AlertDetailPanel alert={selected} onClose={() => setSelectedAlertId(null)} />
          </FixedPanel>
        )}
      </div>
    </div>
  )
}
