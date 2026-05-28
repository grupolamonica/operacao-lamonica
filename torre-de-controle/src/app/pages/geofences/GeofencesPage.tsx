import { useState, useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// @ts-ignore — mapbox-gl-draw types work with maplibre-gl v4
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { MapPin, Plus, Trash2, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useGeofences, useCreateGeofence, useDeleteGeofence } from '@/hooks/useGeofences'

const FENCE_TYPES = [
  { value: 'zona_restrita', label: 'Zona Restrita',  color: '#ef4444' },
  { value: 'zona_perigo',   label: 'Zona de Perigo', color: '#f97316' },
  { value: 'zona_operacao', label: 'Zona Operação',  color: '#3b82f6' },
  { value: 'checkpoint',    label: 'Checkpoint',     color: '#22c55e' },
]

export function GeofencesPage() {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<maplibregl.Map | null>(null)
  const drawRef       = useRef<MapboxDraw | null>(null)
  const initRef       = useRef(false)

  const [newName, setNewName]   = useState('')
  const [newType, setNewType]   = useState('zona_restrita')
  const [drawing, setDrawing]   = useState(false)
  const [pendingGeo, setPendingGeo] = useState<number[][][] | null>(null)

  const { data: fences, isLoading } = useGeofences()
  const createMutation = useCreateGeofence()
  const deleteMutation = useDeleteGeofence()

  // Init map + draw
  useEffect(() => {
    if (initRef.current || !containerRef.current) return
    initRef.current = true

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     'https://tiles.openfreemap.org/styles/liberty',
      center:    [-46.6333, -23.5505],
      zoom:      10,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-left')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    // @ts-ignore
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    })

    // @ts-ignore
    map.addControl(draw)
    drawRef.current = draw

    map.on('load', () => {
      map.resize()

      // Render existing geofences on load
      renderGeofences(map)
    })

    map.on('draw.create', (e: any) => {
      const feature = e.features[0]
      if (feature?.geometry?.type === 'Polygon') {
        setPendingGeo(feature.geometry.coordinates)
        setDrawing(true)
      }
    })

    map.on('draw.update', (e: any) => {
      const feature = e.features[0]
      if (feature?.geometry?.type === 'Polygon') {
        setPendingGeo(feature.geometry.coordinates)
      }
    })

    mapRef.current = map

    return () => {
      initRef.current = false
      mapRef.current = null
      drawRef.current = null
      map.remove()
    }
  }, [])

  // Re-render geofences when list changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    renderGeofences(map)
  }, [fences])

  function renderGeofences(map: maplibregl.Map) {
    // Remove existing geofence layers
    if (map.getLayer('geofences-fill')) map.removeLayer('geofences-fill')
    if (map.getLayer('geofences-line')) map.removeLayer('geofences-line')
    if (map.getSource('geofences')) map.removeSource('geofences')

    const geojson = {
      type: 'FeatureCollection' as const,
      features: fences.map(f => ({
        type: 'Feature' as const,
        properties: { id: f.id, name: f.name, color: f.color, type: f.type },
        geometry: { type: 'Polygon' as const, coordinates: f.coordinates },
      })),
    }

    map.addSource('geofences', { type: 'geojson', data: geojson })
    map.addLayer({
      id: 'geofences-fill',
      type: 'fill',
      source: 'geofences',
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 },
    })
    map.addLayer({
      id: 'geofences-line',
      type: 'line',
      source: 'geofences',
      paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
    })
  }

  async function handleCreate() {
    if (!pendingGeo || !newName.trim()) return
    const typeInfo = FENCE_TYPES.find(t => t.value === newType)!
    await createMutation.mutateAsync({
      name:        newName.trim(),
      type:        newType,
      color:       typeInfo.color,
      coordinates: pendingGeo,
    })
    setNewName('')
    setPendingGeo(null)
    setDrawing(false)
    drawRef.current?.deleteAll()
  }

  return (
    <div className="space-y-5">
      <header className="pb-4 flex items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Geofences</h1>
          <p className="text-sm text-white/70">Zonas geográficas com detecção PostGIS de entrada/saída</p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Map */}
        <Card className="xl:col-span-2 overflow-hidden p-0">
          <div className="relative" style={{ height: 480 }}>
            <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
            {drawing && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
                <div className="bg-card rounded-lg shadow-lg p-3 flex items-center gap-3 text-sm border border-border">
                  <Plus className="h-4 w-4 text-primary" />
                  <span className="text-foreground">Polígono desenhado. Salvar como:</span>
                  <input
                    className="border border-border rounded px-2 py-1 text-xs w-28 bg-background text-foreground"
                    placeholder="Nome da zona"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                  />
                  <select
                    className="border border-border rounded px-2 py-1 text-xs bg-background text-foreground"
                    value={newType}
                    onChange={e => setNewType(e.target.value)}
                  >
                    {FENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || createMutation.isPending}
                    className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs disabled:opacity-50"
                  >
                    {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
                  </button>
                  <button
                    onClick={() => { setDrawing(false); setPendingGeo(null); drawRef.current?.deleteAll() }}
                    className="px-3 py-1 bg-muted text-muted-foreground rounded text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground px-3 py-2">
            Use o botão de polígono no canto superior esquerdo para desenhar uma zona.
          </p>
        </Card>

        {/* Geofence list */}
        <Card className="p-4 space-y-3 overflow-auto max-h-[540px]">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" /> Zonas cadastradas ({fences.length})
          </h2>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : fences.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Nenhuma zona cadastrada.<br />Use o mapa para desenhar.
            </p>
          ) : (
            fences.map(f => {
              const typeInfo = FENCE_TYPES.find(t => t.value === f.type)
              return (
                <div key={f.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border">
                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: f.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{f.name}</p>
                    <p className="text-[10px] text-muted-foreground">{typeInfo?.label}</p>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(f.id)}
                    disabled={deleteMutation.isPending}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })
          )}
        </Card>
      </div>
    </div>
  )
}
