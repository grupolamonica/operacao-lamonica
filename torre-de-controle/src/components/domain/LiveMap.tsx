import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapIcon, Satellite, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVehiclePositions, usePositionsStore } from '@/hooks/useVehiclePositions'

const SLA_COLORS: Record<string, string> = {
  no_prazo: '#2dce89',
  em_risco: '#fb6340',
  atrasado: '#f5365c',
  sem_sinal: '#95959e',
}

// Free OpenFreeMap tiles — no API key required
const TILE_STYLES = {
  mapa:      'https://tiles.openfreemap.org/styles/liberty',
  satelite:  'https://tiles.openfreemap.org/styles/positron', // closest "light" style as satellite alt
}

interface Props {
  height?: number | string
  showLegend?: boolean
  selectedVehicleId?: string | null
  onVehicleClick?: (vehicleId: string) => void
}

export function LiveMap({ height = 400, showLegend = true, selectedVehicleId, onVehicleClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const markersRef   = useRef<Map<string, maplibregl.Marker>>(new Map())
  const [mode, setMode]   = useState<'mapa' | 'satelite'>('mapa')

  useVehiclePositions()
  const { positions, connected } = usePositionsStore()

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     TILE_STYLES.mapa,
      center:    [-46.6333, -23.5505], // São Paulo
      zoom:      11,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-left')
    map.addControl(new maplibregl.ScaleControl(), 'bottom-right')
    mapRef.current = map

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Switch tile style when mode changes
  useEffect(() => {
    mapRef.current?.setStyle(TILE_STYLES[mode])
  }, [mode])

  // Update vehicle markers whenever positions change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const currentIds = new Set(positions.keys())

    // Remove stale markers
    for (const [id, marker] of markersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    }

    // Add/update markers
    for (const [id, pos] of positions) {
      const color = SLA_COLORS[pos.slaStatus] ?? SLA_COLORS.sem_sinal
      const isSelected = id === selectedVehicleId

      if (!markersRef.current.has(id)) {
        // Create SVG marker
        const el = document.createElement('div')
        el.style.cssText = `
          width:${isSelected ? 20 : 16}px;
          height:${isSelected ? 20 : 16}px;
          border-radius:50%;
          background:${color};
          border:2px solid white;
          box-shadow:0 2px 4px rgba(0,0,0,.4);
          cursor:pointer;
          transition:transform .15s;
        `
        el.title = `Vehicle ${id.slice(0, 8)} — ${pos.slaStatus}`
        el.addEventListener('click', () => onVehicleClick?.(id))

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([pos.lng, pos.lat])
          .addTo(map)
        markersRef.current.set(id, marker)
      } else {
        // Update existing marker position + color
        const marker = markersRef.current.get(id)!
        marker.setLngLat([pos.lng, pos.lat])
        const el = marker.getElement() as HTMLDivElement
        el.style.background = color
        el.style.width = isSelected ? '20px' : '16px'
        el.style.height = isSelected ? '20px' : '16px'
      }
    }
  }, [positions, selectedVehicleId, onVehicleClick])

  return (
    <div
      className="relative rounded-lg overflow-hidden border border-border"
      style={{ height }}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Mode toggle */}
      <div className="absolute top-3 right-3 flex bg-card rounded-md shadow-sm overflow-hidden text-xs z-10">
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

      {/* WS connection badge */}
      <div className={cn(
        'absolute top-3 left-14 flex items-center gap-1 text-xs px-2 py-1 rounded-md shadow-sm z-10',
        connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
      )}>
        {connected
          ? <><Wifi className="h-3 w-3" /> Ao vivo ({positions.size})</>
          : <><WifiOff className="h-3 w-3" /> Offline</>
        }
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="absolute bottom-8 left-3 bg-card rounded-md shadow-sm px-3 py-2 text-xs space-y-1 z-10">
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-[#2dce89]" /> No prazo</div>
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-[#fb6340]" /> Em risco</div>
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-[#f5365c]" /> Atrasado</div>
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-[#95959e]" /> Sem sinal</div>
        </div>
      )}
    </div>
  )
}
