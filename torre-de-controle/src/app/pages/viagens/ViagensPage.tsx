import { useState } from 'react'
import { ViagensKPIRow } from './components/ViagensKPIRow'
import { ViagensTabs } from './components/ViagensTabs'
import { ViagensFiltersPanel } from './components/ViagensFiltersPanel'
import { ViagensTable } from './components/ViagensTable'
import type { TripFilters } from '@/data/types'

export function ViagensPage() {
  const [filters, setFilters] = useState<TripFilters>({})

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Viagens</h1>
          <p className="text-sm text-gray-500">Lista completa com filtros e detalhamento</p>
        </div>
      </header>

      <ViagensKPIRow />

      <ViagensTabs />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-3">
          <ViagensFiltersPanel filters={filters} onChange={setFilters} />
        </div>
        <div className="lg:col-span-9 min-w-0">
          <ViagensTable filters={filters} />
        </div>
      </div>
    </div>
  )
}
