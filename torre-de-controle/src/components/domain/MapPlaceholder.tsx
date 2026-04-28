import { Map as MapIcon, Satellite } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  height?: number | string
  showLegend?: boolean
}

export function MapPlaceholder({ height = 400, showLegend = true }: Props) {
  const [mode, setMode] = useState<'mapa' | 'satelite'>('mapa')

  return (
    <div
      className="relative rounded-lg overflow-hidden border border-gray-200"
      style={{ height, background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <MapIcon className="h-12 w-12 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-300">Mapa será carregado na Phase 3</p>
          <p className="text-xs text-gray-500 mt-1">Mapbox GL JS</p>
        </div>
      </div>

      <div className="absolute top-3 right-3 flex bg-white rounded-md shadow-sm overflow-hidden text-xs">
        <button
          onClick={() => setMode('mapa')}
          className={cn(
            'px-3 py-1.5 flex items-center gap-1.5',
            mode === 'mapa' ? 'bg-[#0f62fe] text-white' : 'text-gray-700 hover:bg-gray-50',
          )}
        >
          <MapIcon className="h-3 w-3" /> Mapa
        </button>
        <button
          onClick={() => setMode('satelite')}
          className={cn(
            'px-3 py-1.5 flex items-center gap-1.5',
            mode === 'satelite' ? 'bg-[#0f62fe] text-white' : 'text-gray-700 hover:bg-gray-50',
          )}
        >
          <Satellite className="h-3 w-3" /> Satélite
        </button>
      </div>

      {showLegend && (
        <div className="absolute bottom-3 left-3 bg-white rounded-md shadow-sm px-3 py-2 text-xs space-y-1">
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#2ecc71]" /> No prazo</div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#f39c12]" /> Em risco</div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#e74c3c]" /> Atrasado</div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#95a5a6]" /> Sem sinal</div>
        </div>
      )}
    </div>
  )
}
