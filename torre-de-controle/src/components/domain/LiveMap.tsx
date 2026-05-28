import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapIcon, Satellite, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePositionsStore } from '@/hooks/useVehiclePositions'

const SLA_COLORS: Record<string, string> = {
  no_prazo:  '#2dce89',
  em_risco:  '#fb6340',
  atrasado:  '#f5365c',
  sem_sinal: '#95959e',
}

// Free OpenFreeMap tiles — no API key required
const TILE_STYLES = {
  mapa:     'https://tiles.openfreemap.org/styles/liberty',
  satelite: 'https://tiles.openfreemap.org/styles/positron',
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
  const initRef      = useRef(false)  // React StrictMode guard
  const [mode, setMode] = useState<'mapa' | 'satelite'>('mapa')
  const [mapReady, setMapReady] = useState(false)

  // Read from global positions store (WS managed in AppLayout)
  const positions = usePositionsStore(s => s.positions)
  const connected = usePositionsStore(s => s.connected)

  // Init map once — guard prevents React StrictMode double-init
  useEffect(() => {
    if (initRef.current || !containerRef.current) return
    initRef.current = true

    const map = new maplibregl.Map({
      container:     containerRef.current,
      style:         TILE_STYLES.mapa,
      center:        [-46.6333, -23.5505],
      zoom:          11,
      attributionControl: false,
    })

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new maplibregl.NavigationControl(), 'top-left')

    map.on('load', () => {
      map.resize()  // fix container size computed after mount
      setMapReady(true)
    })

    mapRef.current = map

    return () => {
      initRef.current = false
      mapRef.current = null
      markersRef.current.clear()
      map.remove()
    }
  }, [])

  // Style switch
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    mapRef.current.setStyle(TILE_STYLES[mode])
  }, [mode, mapReady])

  // Update vehicle markers
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const currentIds = new Set(positions.keys())

    for (const [id, marker] of markersRef.current) {
      if (!currentIds.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    }

    for (const [id, pos] of positions) {
      const color      = SLA_COLORS[pos.slaStatus] ?? SLA_COLORS.sem_sinal
      const isSelected = id === selectedVehicleId
      const size       = isSelected ? '20px' : '14px'

      if (!markersRef.current.has(id)) {
        const el = document.createElement('div')
        el.style.cssText = `width:${size};height:${size};border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,.4);cursor:pointer;transition:all .15s;`
        el.title = `${id.slice(0, 8)} — ${pos.slaStatus}`
        el.addEventListener('click', () => onVehicleClick?.(id))

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([Number(pos.lng), Number(pos.lat)])
          .addTo(map)
        markersRef.current.set(id, marker)
      } else {
        const marker = markersRef.current.get(id)!
        marker.setLngLat([Number(pos.lng), Number(pos.lat)])
        const el = marker.getElement() as HTMLDivElement
        el.style.background = color
        el.style.width  = size
        el.style.height = size
      }
    }
  }, [positions, selectedVehicleId, onVehicleClick, mapReady])

  return (
    <div className="relative rounded-lg border border-border overflow-hidden" style={{ height }}>
      {/* Map canvas — fill the container */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Mode toggle */}
      <div className="absolute top-3 right-3 flex bg-card rounded-md shadow-sm overflow-hidden text-xs z-10">
        <button
          onClick={() => setMode('mapa')}
          className={cn('px-3 py-1.5 flex items-center gap-1.5 transition-colors',
            mode === 'mapa' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent')}
        >
          <MapIcon className="h-3 w-3" /> Mapa
        </button>
        <button
          onClick={() => setMode('satelite')}
          className={cn('px-3 py-1.5 flex items-center gap-1.5 transition-colors',
            mode === 'satelite' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent')}
        >
          <Satellite className="h-3 w-3" /> Satélite
        </button>
      </div>

      {/* WS status badge */}
      <div className={cn('absolute top-3 left-14 flex items-center gap-1 text-xs px-2 py-1 rounded-md shadow-sm z-10',
        connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
        {connected
          ? <><Wifi className="h-3 w-3" /> Ao vivo ({positions.size})</>
          : <><WifiOff className="h-3 w-3" /> Offline</>}
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="absolute bottom-8 left-3 bg-card/90 backdrop-blur-sm rounded-md shadow-sm px-3 py-2 text-xs space-y-1 z-10">
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-[#2dce89]" /> No prazo</div>
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-[#fb6340]" /> Em risco</div>
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-[#f5365c]" /> Atrasado</div>
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-[#95959e]" /> Sem sinal</div>
        </div>
      )}
    </div>
  )
}
