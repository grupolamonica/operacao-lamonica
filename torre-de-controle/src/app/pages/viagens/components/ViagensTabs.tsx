import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTrips } from '@/hooks/useTrips'
import { useUIStore } from '@/stores/useUIStore'
import type { TripStatus } from '@/data/types'

const tabConfig = [
  { id: 'em_andamento', label: 'Em andamento', tripStatus: 'in_progress' as TripStatus },
  { id: 'planejadas',   label: 'Planejadas',    tripStatus: 'planned'     as TripStatus },
  { id: 'concluidas',   label: 'Concluídas',    tripStatus: 'completed'   as TripStatus },
  { id: 'atrasadas',    label: 'Atrasadas',     tripStatus: 'delayed'     as TripStatus },
] as const

export function ViagensTabs() {
  const { activeTripsTab, setActiveTripsTab } = useUIStore()
  const { data: all } = useTrips()
  const counts = {
    em_andamento: all.filter(t => t.status === 'in_progress').length,
    planejadas:   all.filter(t => t.status === 'planned').length,
    concluidas:   all.filter(t => t.status === 'completed').length,
    atrasadas:    all.filter(t => t.status === 'delayed').length,
  }

  return (
    <Tabs value={activeTripsTab} onValueChange={(v) => setActiveTripsTab(v as typeof activeTripsTab)}>
      <TabsList className="bg-white border border-gray-200">
        {tabConfig.map(t => (
          <TabsTrigger key={t.id} value={t.id} className="data-[state=active]:bg-[#0f62fe] data-[state=active]:text-white">
            {t.label}
            <span className="ml-2 text-xs opacity-80 tabular-nums">({counts[t.id]})</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
