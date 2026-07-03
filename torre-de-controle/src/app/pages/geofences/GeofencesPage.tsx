import { useState, useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapPin, Plus, Trash2, Loader2, MousePointer, CheckCircle, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useGeofences, useCreateGeofence, useDeleteGeofence } from '@/hooks/useGeofences'
import type { Geofence } from '@/hooks/useGeofences'
import { cn } from '@/lib/utils'

const FENCE_TYPES = [
  { value: 'zona_restrita', label: 'Zona Restrita',  color: '#ef4444' },
  { value: 'zona_perigo',   label: 'Zona de Perigo', color: '#f97316' },
  { value: 'zona_operacao', label: 'Zona Operação',  color: '#3b82f6' },
  { value: 'checkpoint',    label: 'Checkpoint',     color: '#22c55e' },
  { value: 'doca',          label: 'Doca (carreg./descarga)', color: '#14b8a6' },
]

export function GeofencesPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const initRef      = useRef(false)
  const markersRef   = useRef<maplibregl.Marker[]>([])

  const [isDrawing, setIsDrawing]     = useState(false)
  const [drawPoints, setDrawPoints]   = useState<[number, number][]>([])
  const [newName, setNewName]         = useState('')
  const [newType, setNewType]         = useState('zona_restrita')

  const { data: fences, isLoading } = useGeofences()
  const createMutation = useCreateGeofence()
  const deleteMutation = useDeleteGeofence()

  // Map cursor effect when drawing
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = isDrawing ? 'crosshair' : ''
  }, [isDrawing])

  // Handle map clicks to collect polygon vertices
  const handleMapClick = useCallback((e: maplibregl.MapMouseEvent) => {
    if (!isDrawing) return
    const { lng, lat } = e.lngLat
    setDrawPoints(prev => [...prev, [lng, lat]])
  }, [isDrawing])

  // Init map
  useEffect(() => {
    if (initRef.current || !containerRef.current) return
    initRef.current = true

    const map = new maplibregl.Map({
      container:          containerRef.current,
      style:              'https://tiles.openfreemap.org/styles/liberty',
      center:             [-46.6333, -23.5505],
      zoom:               10,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-left')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      map.resize()
      renderGeofences(map)
    })

    map.on('click', handleMapClick)
    mapRef.current = map

    return () => {
      initRef.current = false
      map.off('click', handleMapClick)
      map.remove()
      mapRef.current = null
    }
  }, [handleMapClick])

  // Re-render when click handler or fences change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.off('click', handleMapClick)
    map.on('click', handleMapClick)
  }, [handleMapClick])

  // Update geofence overlays when fences change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    renderGeofences(map)
  }, [fences])

  // Draw preview markers for current polygon points
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (isDrawing && drawPoints.length > 0) {
      drawPoints.forEach(([lng, lat], i) => {
        const el = document.createElement('div')
        el.style.cssText = `width:8px;height:8px;border-radius:50%;background:${i === 0 ? '#0f62fe' : '#64748b'};border:2px solid white;`
        const marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
        markersRef.current.push(marker)
      })

      // Update or add preview polygon source
      const coords = [...drawPoints]
      if (coords.length >= 3) {
        const closed = [...coords, coords[0]!]
        const geojson: GeoJSON.GeoJSON = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [closed] },
          }],
        }
        if (map.getSource('draw-preview')) {
          (map.getSource('draw-preview') as maplibregl.GeoJSONSource).setData(geojson)
        } else {
          map.addSource('draw-preview', { type: 'geojson', data: geojson })
          map.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw-preview', paint: { 'fill-color': '#0f62fe', 'fill-opacity': 0.15 } })
          map.addLayer({ id: 'draw-line', type: 'line', source: 'draw-preview', paint: { 'line-color': '#0f62fe', 'line-width': 2, 'line-dasharray': [2, 2] } })
        }
      }
    } else {
      if (map.getLayer('draw-fill')) map.removeLayer('draw-fill')
      if (map.getLayer('draw-line')) map.removeLayer('draw-line')
      if (map.getSource('draw-preview')) map.removeSource('draw-preview')
    }
  }, [isDrawing, drawPoints])

  function renderGeofences(map: maplibregl.Map) {
    if (map.getLayer('fences-fill')) map.removeLayer('fences-fill')
    if (map.getLayer('fences-line')) map.removeLayer('fences-line')
    if (map.getLayer('fences-label')) map.removeLayer('fences-label')
    if (map.getSource('fences')) map.removeSource('fences')

    const geojson: GeoJSON.GeoJSON = {
      type: 'FeatureCollection',
      features: fences.filter(f => f.isActive).map(f => ({
        type: 'Feature' as const,
        properties: { id: f.id, name: f.name, color: f.color },
        geometry: { type: 'Polygon' as const, coordinates: f.coordinates },
      })),
    }
    map.addSource('fences', { type: 'geojson', data: geojson })
    map.addLayer({ id: 'fences-fill', type: 'fill', source: 'fences', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 } })
    map.addLayer({ id: 'fences-line', type: 'line', source: 'fences', paint: { 'line-color': ['get', 'color'], 'line-width': 2 } })
  }

  function cancelDraw() {
    setIsDrawing(false)
    setDrawPoints([])
    setNewName('')
  }

  async function saveFence() {
    if (drawPoints.length < 3 || !newName.trim()) return
    const closed = [...drawPoints, drawPoints[0]!]
    const typeInfo = FENCE_TYPES.find(t => t.value === newType)!
    await createMutation.mutateAsync({
      name:        newName.trim(),
      type:        newType,
      color:       typeInfo.color,
      coordinates: [closed],
    })
    cancelDraw()
  }

  return (
    <div className="space-y-5">
      <header className="pb-4">
        <h1 className="text-2xl font-bold text-white">Geofences</h1>
        <p className="text-sm text-white/70">Zonas geográficas com detecção PostGIS de entrada/saída</p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Map */}
        <Card className="xl:col-span-2 overflow-hidden p-0">
          <div className="relative" style={{ height: 480 }}>
            <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

            {/* Drawing toolbar */}
            <div className="absolute top-3 right-3 z-10 flex gap-2">
              {!isDrawing ? (
                <button
                  onClick={() => setIsDrawing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs shadow"
                >
                  <MousePointer className="h-3 w-3" /> Desenhar zona
                </button>
              ) : (
                <>
                  <span className="flex items-center gap-1 px-2 py-1.5 bg-blue-600 text-white rounded-md text-xs shadow">
                    <Plus className="h-3 w-3" /> {drawPoints.length} pts
                  </span>
                  {drawPoints.length >= 3 && (
                    <button onClick={saveFence} disabled={!newName.trim() || createMutation.isPending}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-md text-xs shadow disabled:opacity-50">
                      <CheckCircle className="h-3 w-3" />
                      {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
                    </button>
                  )}
                  <button onClick={cancelDraw} className="flex items-center gap-1 px-3 py-1.5 bg-card text-foreground rounded-md text-xs shadow border border-border">
                    <XCircle className="h-3 w-3" /> Cancelar
                  </button>
                </>
              )}
            </div>

            {/* Drawing form overlay */}
            {isDrawing && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
                <div className="bg-card rounded-lg shadow-lg p-3 flex items-center gap-3 text-sm border border-border">
                  <input
                    className="border border-border rounded px-2 py-1 text-xs w-32 bg-background text-foreground"
                    placeholder="Nome da zona"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    autoFocus
                  />
                  <select
                    className="border border-border rounded px-2 py-1 text-xs bg-background text-foreground"
                    value={newType}
                    onChange={e => setNewType(e.target.value)}
                  >
                    {FENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground">Clique no mapa para adicionar pontos</span>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground px-3 py-2">
            {isDrawing
              ? `${drawPoints.length} pontos desenhados. Mínimo 3 para salvar.`
              : 'Clique em "Desenhar zona" para criar uma nova geofence.'}
          </p>
        </Card>

        {/* Geofence list */}
        <Card className="p-4 space-y-3 overflow-auto max-h-[540px]">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Zonas cadastradas ({fences.length})
          </h2>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : fences.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Nenhuma zona cadastrada.<br />Use o mapa para desenhar.
            </p>
          ) : (
            fences.map((f: Geofence) => {
              const typeInfo = FENCE_TYPES.find(t => t.value === f.type)
              return (
                <div key={f.id} className={cn(
                  'flex items-center gap-2 p-2 rounded-md border',
                  f.isActive ? 'bg-muted/30 border-border' : 'bg-muted/10 border-border/50 opacity-60',
                )}>
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
