import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Flame, AlertTriangle, Route, ParkingSquare, Layers, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHeatmap, type HeatmapLayer, type HeatmapPeriod, type HeatmapPayload } from '@/hooks/useHeatmap'

const LAYERS: Array<{ id: HeatmapLayer; label: string; icon: typeof Flame }> = [
  { id: 'alertas', label: 'Ocorrências', icon: AlertTriangle },
  { id: 'atrasos', label: 'Atrasos',     icon: Flame         },
  { id: 'desvios', label: 'Desvios',     icon: Route         },
  { id: 'paradas', label: 'Paradas',     icon: ParkingSquare },
  { id: 'risco',   label: 'Risco vivo',  icon: Layers        },
]

const PERIODS: Array<{ id: HeatmapPeriod; label: string }> = [
  { id: 'today', label: 'Hoje'   },
  { id: '7d',    label: '7 dias' },
  { id: '30d',   label: '30 dias' },
]

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

function pointsToGeoJson(data: HeatmapPayload | undefined): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (data?.points ?? []).map((p) => ({
      type:       'Feature' as const,
      properties: { weight: p.weight },
      geometry:   { type: 'Point' as const, coordinates: [p.lng, p.lat] },
    })),
  }
}

export function HeatmapPage() {
  const [layer,  setLayer ] = useState<HeatmapLayer>('alertas')
  const [period, setPeriod] = useState<HeatmapPeriod>('7d')
  const { data, isLoading } = useHeatmap(layer, period)

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const readyRef     = useRef(false)
  const [mapReady, setMapReady] = useState(false)

  // Init map once
  useEffect(() => {
    if (readyRef.current || !containerRef.current) return
    readyRef.current = true
    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     STYLE_URL,
      center:    [-46.6333, -23.5505],
      zoom:      9,
      attributionControl: false,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new maplibregl.NavigationControl(), 'top-left')
    map.on('load', () => setMapReady(true))
    map.on('idle', () => setMapReady(true))
    mapRef.current = map
    return () => {
      readyRef.current = false
      mapRef.current = null
      map.remove()
    }
  }, [])

  // Update layer
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const apply = () => {
      if (!map.isStyleLoaded()) { map.once('idle', apply); return }
      const geojson = pointsToGeoJson(data)
      if (map.getSource('heat')) {
        ;(map.getSource('heat') as maplibregl.GeoJSONSource).setData(geojson)
      } else {
        map.addSource('heat', { type: 'geojson', data: geojson })
        map.addLayer({
          id:    'heat-layer',
          type:  'heatmap',
          source: 'heat',
          maxzoom: 15,
          paint: {
            'heatmap-weight':    ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 10, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
            'heatmap-radius':    ['interpolate', ['linear'], ['zoom'], 0, 12, 9, 28, 14, 60],
            'heatmap-opacity':   ['interpolate', ['linear'], ['zoom'], 7, 0.85, 14, 0.55],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0,   'rgba(0, 0, 255, 0)',
              0.2, 'royalblue',
              0.4, 'cyan',
              0.6, 'lime',
              0.8, 'yellow',
              1,   'red',
            ],
          },
        })
      }
      // Fit bounds when bounds are present
      if (data?.bounds) {
        const [[minLng, minLat], [maxLng, maxLat]] = data.bounds
        if (minLng !== maxLng || minLat !== maxLat) {
          map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, maxZoom: 11, duration: 600 })
        }
      }
    }
    apply()
  }, [data, mapReady])

  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Heatmap de problemas</h1>
          <p className="text-sm text-white/70">Densidade geográfica de ocorrências e risco por camada</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex bg-card border border-border rounded-md overflow-hidden shadow-sm">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  period === p.id ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
                )}
              >{p.label}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex gap-2 flex-wrap">
        {LAYERS.map((L) => {
          const active = layer === L.id
          return (
            <button
              key={L.id}
              onClick={() => setLayer(L.id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
                active
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'bg-card border-border text-foreground hover:bg-accent',
              )}
            >
              <L.icon className="h-3.5 w-3.5" /> {L.label}
            </button>
          )
        })}
      </div>

      <div className="relative rounded-lg border border-border overflow-hidden" style={{ height: 560 }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
        {isLoading && (
          <div className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border text-xs">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando
          </div>
        )}
        {data && (
          <div className="absolute bottom-3 left-3 z-10 bg-card/90 backdrop-blur-sm rounded-md shadow-sm px-3 py-2 text-xs space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Camada: <strong className="text-foreground">{LAYERS.find(L => L.id === layer)?.label}</strong> · {data.count} pontos
            </p>
            <div className="h-2 w-32 rounded-full" style={{
              background: 'linear-gradient(90deg, rgba(0,0,255,0) 0%, royalblue 20%, cyan 40%, lime 60%, yellow 80%, red 100%)',
            }} />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>baixa</span><span>alta</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
