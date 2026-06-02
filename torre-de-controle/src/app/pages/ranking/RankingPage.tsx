import { useMemo, useState } from 'react'
import { Trophy, FileText, BarChart3, ShieldAlert, Route, ScrollText } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FilterBar, SelectFilter, MultiSelectFilter, DateRangeFilter } from '@/components/domain/FilterBar'
import { useRankingDrivers, useRankingTrips, useCanWriteRanking, type RankingFilterOpts } from '@/hooks/useRanking'
import {
  DEFAULT_IGNORED_OCCURRENCES,
  extractUniqueOccurrences,
  getDriverVinculoLabel,
  getRouteKey,
  getRouteLabel,
} from '@/lib/driverInsights'
import { StatsCards } from './components/StatsCards'
import { RankingTab } from './components/RankingTab'
import { ViagensTab } from './components/ViagensTab'
import { QualidadeTab } from './components/QualidadeTab'
import { BloqueiosTab } from './components/BloqueiosTab'
import { RotasTab } from './components/RotasTab'
import { LogsTab } from './components/LogsTab'
import { DriverImport } from './components/DriverImport'

/** ISO date (yyyy-mm-dd, do <input type=date>) → BR (dd/MM/yyyy, esperado pelo
 *  parseDateBR do backend). */
function isoToBr(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/**
 * RankingPage — shell de 6 abas + BARRA DE FILTROS no topo (padrão do Insights).
 *
 * Os filtros vivem aqui (estado único) e são aplicados de duas formas:
 *   - Ocorrências (ignorar tipos) + Período → params do backend (re-score via
 *     composeRanking; KPIs/ranking/viagens recalculados). Score arredondado no display.
 *   - Vínculo + Rota → filtro client-side nas tabelas (Ranking/Viagens).
 * StatsCards/RankingTab/ViagensTab recebem `opts` (mesma queryKey → cache compartilhado).
 */
export function RankingPage() {
  const canWrite = useCanWriteRanking()

  const [vinculo, setVinculo] = useState('all')
  const [rota, setRota] = useState('all')
  const [ignored, setIgnored] = useState<string[]>(DEFAULT_IGNORED_OCCURRENCES)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const opts = useMemo<RankingFilterOpts>(
    () => ({
      ignoredOccurrences: ignored,
      from: from ? isoToBr(from) : undefined,
      to: to ? isoToBr(to) : undefined,
    }),
    [ignored, from, to],
  )

  // Filter OPTIONS derive from the (filtered) data — shared cache with the tabs.
  const { data: drivers } = useRankingDrivers(opts)
  const { data: trips, isLoading: tripsLoading } = useRankingTrips(opts)

  const vinculoOptions = useMemo(() => {
    const s = new Set<string>()
    for (const d of drivers) s.add(getDriverVinculoLabel(d.vinculo))
    return [...s].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }))
  }, [drivers])

  const rotaOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of trips) m.set(getRouteKey(t.origin_code, t.destination_code), getRouteLabel(t.origin_code, t.destination_code))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))
  }, [trips])

  // Merge selected items so they always appear even before trips finish loading
  const occurrenceOptions = useMemo(() => {
    const set = new Set(extractUniqueOccurrences(trips))
    for (const o of ignored) set.add(o)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [trips, ignored])

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 pb-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-bold text-white">Ranking</h1>
          <p className="text-sm text-white/70">Avaliação e ranking de motoristas (somente leitura)</p>
        </div>
        <div className="lg:ml-auto">
          <FilterBar>
            <SelectFilter value={vinculo} onChange={setVinculo} options={vinculoOptions} allLabel="Todos os vínculos" placeholder="Vínculo" width="w-[180px]" />
            <SelectFilter value={rota} onChange={setRota} options={rotaOptions} allLabel="Todas as rotas" placeholder="Rota" width="w-[200px]" />
            <MultiSelectFilter
              label="Ocorrências"
              options={occurrenceOptions}
              selected={ignored}
              onChange={setIgnored}
              onReset={() => setIgnored(DEFAULT_IGNORED_OCCURRENCES)}
              countNoun="ignorada"
              isLoading={tripsLoading}
            />
            <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
            {canWrite && <DriverImport />}
          </FilterBar>
        </div>
      </header>

      <StatsCards opts={opts} />

      <Tabs defaultValue="ranking" className="space-y-4">
        <TabsList
          className="grid w-full grid-cols-2 h-auto bg-card sm:grid-cols-3 lg:grid-cols-6"
          style={{ border: '1px solid var(--border)' }}
        >
          <TabsTrigger value="ranking"><Trophy className="h-4 w-4" />Ranking</TabsTrigger>
          <TabsTrigger value="viagens"><FileText className="h-4 w-4" />Viagens</TabsTrigger>
          <TabsTrigger value="qualidade"><BarChart3 className="h-4 w-4" />Qualidade</TabsTrigger>
          <TabsTrigger value="bloqueios"><ShieldAlert className="h-4 w-4" />Bloqueios</TabsTrigger>
          <TabsTrigger value="rotas"><Route className="h-4 w-4" />Rotas</TabsTrigger>
          <TabsTrigger value="logs"><ScrollText className="h-4 w-4" />Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="ranking"><RankingTab opts={opts} vinculo={vinculo} /></TabsContent>
        <TabsContent value="viagens"><ViagensTab opts={opts} vinculo={vinculo} rota={rota} /></TabsContent>
        <TabsContent value="qualidade"><QualidadeTab opts={opts} /></TabsContent>
        <TabsContent value="bloqueios"><BloqueiosTab /></TabsContent>
        <TabsContent value="rotas"><RotasTab /></TabsContent>
        <TabsContent value="logs"><LogsTab /></TabsContent>
      </Tabs>
    </div>
  )
}
