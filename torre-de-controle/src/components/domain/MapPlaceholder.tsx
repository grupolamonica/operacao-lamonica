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
      className="relative rounded-lg overflow-hidden border border-border"
      style={{ height, background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          {/* text-slate-* intentional: overlaid on always-dark map gradient, theme token not applicable */}
          <MapIcon className="h-12 w-12 mx-auto text-slate-400 mb-2" />
          <p className="text-sm text-slate-300">Mapa será carregado na Phase 3</p>
          <p className="text-xs text-slate-500 mt-1">Mapbox GL JS</p>
        </div>
      </div>

      <div className="absolute top-3 right-3 flex bg-card rounded-md shadow-sm overflow-hidden text-xs">
        <button
          onClick={() => setMode('mapa')}
          className={cn(
            'px-3 py-1.5 flex items-center gap-1.5 transition-colors',
            mode === 'mapa' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
          )}
        >
          <MapIcon className="h-3 w-3" /> Mapa
        </button>
        <button
          onClick={() => setMode('satelite')}
          className={cn(
            'px-3 py-1.5 flex items-center gap-1.5 transition-colors',
            mode === 'satelite' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
          )}
        >
          <Satellite className="h-3 w-3" /> Satélite
        </button>
      </div>

      {showLegend && (
        <div className="absolute bottom-3 left-3 bg-card rounded-md shadow-sm px-3 py-2 text-xs space-y-1">
          {/* Status dot colors — semantic constants, same in both themes */}
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-[#2dce89]" /> No prazo</div>
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-[#fb6340]" /> Em risco</div>
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-[#f5365c]" /> Atrasado</div>
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-[#95959e]" /> Sem sinal</div>
        </div>
      )}
    </div>
  )
}
