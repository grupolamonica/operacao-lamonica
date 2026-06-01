import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapIcon, Satellite, Truck, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePositionsStore } from '@/hooks/useVehiclePositions'
import { useFleetPositions, type FleetPosition } from '@/hooks/useFleetPositions'
import { formatDate } from '@/lib/formatters'

const SLA_COLORS: Record<string, string> = {
  no_prazo:  '#2dce89',
  em_risco:  '#fb6340',
  atrasado:  '#f5365c',
  sem_sinal: '#95959e',
}

// Status colours for fleet layer (D-11-04, oklch tokens allowlisted in STATE)
const FLEET_COLORS = {
  ATIVO:     '#2dce89',  // success green
  BLOQUEADO: '#f5365c',  // danger red
  neutral:   '#95959e',  // muted grey (sem-match)
} as const

// Free OpenFreeMap tiles — no API key required
const TILE_STYLES = {
  mapa:     'https://tiles.openfreemap.org/styles/liberty',
  satelite: 'https://tiles.openfreemap.org/styles/positron',
}

// Lucide Truck path (simplified, usable as SDF icon via SVG data-URI)
const TRUCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect width="7" height="7" x="14" y="11" rx="1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`

interface Props {
  height?: number | string
  showLegend?: boolean
  selectedVehicleId?: string | null
  onVehicleClick?: (vehicleId: string) => void
}

function fleetColor(status: FleetPosition['status']): string {
  if (status === 'ATIVO')     return FLEET_COLORS.ATIVO
  if (status === 'BLOQUEADO') return FLEET_COLORS.BLOQUEADO
  return FLEET_COLORS.neutral
}

/** Build GeoJSON FeatureCollection from fleet positions */
function buildFleetGeoJSON(fleet: FleetPosition[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fleet.map((fp) => ({
      type:       'Feature' as const,
      properties: {
        motorista:   fp.motorista,
        cidade:      fp.cidade,
        uf:          fp.uf,
        dataPosicao: fp.dataPosicao,
        veiculo:     fp.veiculo,
        ranked:      fp.ranked,
        rank:        fp.rank,
        pontuacao:   fp.pontuacao,
        status:      fp.status,
        vinculo:     fp.vinculo,
        color:       fleetColor(fp.status),
      },
      geometry: {
        type:        'Point' as const,
        coordinates: [fp.lng, fp.lat],
      },
    })),
  }
}

/** Register truck SDF image once. Safe to call multiple times — checks hasImage. */
function registerTruckImage(map: maplibregl.Map) {
  if (map.hasImage('truck-icon')) return

  const svgDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(TRUCK_SVG)}`
  const img = new Image(24, 24)
  img.onload = () => {
    if (!map.hasImage('truck-icon')) {
      map.addImage('truck-icon', img, { sdf: true })
    }
  }
  img.src = svgDataUri
}

/** Add/update GeoJSON source + fleet layers. Mirrors renderGeofences pattern. */
function renderFleet(map: maplibregl.Map, fleet: FleetPosition[]) {
  const geojson = buildFleetGeoJSON(fleet)

  // If source already exists, just update data (avoid layer recreation flicker)
  if (map.getSource('fleet')) {
    ;(map.getSource('fleet') as maplibregl.GeoJSONSource).setData(geojson)
    return
  }

  // Guard: remove any orphan layers before adding source
  if (map.getLayer('fleet-cluster-count')) map.removeLayer('fleet-cluster-count')
  if (map.getLayer('fleet-clusters'))      map.removeLayer('fleet-clusters')
  if (map.getLayer('fleet-trucks'))        map.removeLayer('fleet-trucks')

  map.addSource('fleet', {
    type:          'geojson',
    data:          geojson,
    cluster:       true,
    clusterRadius: 50,
    clusterMaxZoom: 14,
  })

  // Circle layer for clusters
  map.addLayer({
    id:     'fleet-clusters',
    type:   'circle',
    source: 'fleet',
    filter: ['has', 'point_count'],
    paint:  {
      'circle-color': [
        'step', ['get', 'point_count'],
        '#51bbd6', 5,
        '#f1a33f', 15,
        '#f28cb1',
      ],
      'circle-radius': [
        'step', ['get', 'point_count'],
        16, 5,
        22, 15,
        28,
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
    },
  })

  // Count label on clusters
  map.addLayer({
    id:     'fleet-cluster-count',
    type:   'symbol',
    source: 'fleet',
    filter: ['has', 'point_count'],
    layout: {
      'text-field':  ['get', 'point_count_abbreviated'],
      'text-font':   ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-size':   12,
    },
    paint: {
      'text-color': '#fff',
    },
  })

  // Symbol layer for individual trucks (SDF recolor via icon-color)
  map.addLayer({
    id:     'fleet-trucks',
    type:   'symbol',
    source: 'fleet',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image':          'truck-icon',
      'icon-size':           0.9,
      'icon-allow-overlap':  true,
      'text-field':          '',
    },
    paint: {
      'icon-color': ['get', 'color'],
    },
  })
}

/** Remove all fleet layers + source from map */
function removeFleet(map: maplibregl.Map) {
  if (map.getLayer('fleet-cluster-count')) map.removeLayer('fleet-cluster-count')
  if (map.getLayer('fleet-clusters'))      map.removeLayer('fleet-clusters')
  if (map.getLayer('fleet-trucks'))        map.removeLayer('fleet-trucks')
  if (map.getSource('fleet'))              map.removeSource('fleet')
}

export function LiveMap({ height = 400, showLegend = true, selectedVehicleId, onVehicleClick }: Props) {
  const containerRef         = useRef<HTMLDivElement>(null)
  const mapRef               = useRef<maplibregl.Map | null>(null)
  const markersRef           = useRef<Map<string, maplibregl.Marker>>(new Map())
  const initRef              = useRef(false)  // React StrictMode guard
  const fleetHandlersRef     = useRef(false)  // fleet click/cursor handlers registered once
  const fleetFittedRef       = useRef(false)  // fitBounds aplicado uma vez por ativação da camada
  const [mode, setMode]      = useState<'mapa' | 'satelite'>('mapa')
  const [mapReady, setMapReady] = useState(false)
  const [showFleet, setShowFleet] = useState(false)  // default OFF (D-11-06)

  // Read from global positions store (WS managed in AppLayout)
  const positions = usePositionsStore(s => s.positions)
  const connected = usePositionsStore(s => s.connected)

  // Fleet positions — only fetch when layer is on (enabled gate)
  const { data: fleet } = useFleetPositions({ enabled: showFleet })

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
      fleetHandlersRef.current = false
      mapRef.current = null
      markersRef.current.clear()
      map.remove()
    }
  }, [])

  // Style switch — re-register fleet after style loads (setStyle drops all sources/layers)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current

    map.setStyle(TILE_STYLES[mode])

    // Re-register truck image + fleet layers after style swap
    map.once('styledata', () => {
      registerTruckImage(map)
      // Give the image load callback a tick, then re-render fleet if it was on
      // We use a short delay to let img.onload fire before addLayer
      setTimeout(() => {
        if (showFleet && fleet.length > 0 && map.isStyleLoaded()) {
          renderFleet(map, fleet)
          registerFleetHandlers(map)
        }
      }, 100)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, mapReady])

  // Fleet layer effect — show/hide based on toggle + data
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    if (showFleet && fleet.length > 0) {
      // isStyleLoaded() é INSTÁVEL com tiles vetoriais (openfreemap) — fica false
      // mesmo com o mapa pronto, e era o motivo dos caminhões NUNCA aparecerem
      // (o guard retornava cedo). Renderiza se o estilo está pronto, senão no
      // próximo 'idle'. addSource/addLayer são seguros pós-'load' (mapReady).
      const doRender = () => {
        registerTruckImage(map)
        renderFleet(map, fleet)
        registerFleetHandlers(map)
        // fitBounds nas posições UMA vez por ativação — senão o mapa fica no
        // center default (SP) e os caminhões (NE/MG) ficam fora do viewport.
        if (!fleetFittedRef.current) {
          const pts = fleet.filter((f) => Number.isFinite(f.lng) && Number.isFinite(f.lat))
          if (pts.length > 0) {
            const lngs = pts.map((f) => f.lng)
            const lats = pts.map((f) => f.lat)
            map.fitBounds(
              [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
              { padding: 60, maxZoom: 8, duration: 800 },
            )
            fleetFittedRef.current = true
          }
        }
      }
      // addSource/addLayer são seguros pós-'load' (garantido por mapReady).
      // Chamar direto — NÃO depender de isStyleLoaded()/'idle' (mapa estático
      // nunca re-dispara 'idle'). Imagem do caminhão carrega async e o addImage
      // dispara repaint, então os ícones aparecem assim que a imagem fica pronta.
      doRender()
    } else if (!showFleet) {
      removeFleet(map)
      fleetHandlersRef.current = false
      fleetFittedRef.current = false
    }
  }, [showFleet, fleet, mapReady])

  /** Register click + cursor handlers for fleet layers. Called once per layer creation. */
  function registerFleetHandlers(map: maplibregl.Map) {
    if (fleetHandlersRef.current) return
    fleetHandlersRef.current = true

    // Cluster click → zoom/expand
    map.on('click', 'fleet-clusters', (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['fleet-clusters'] })
      if (!features.length) return
      const clusterId = features[0]!.properties?.['cluster_id'] as number
      const coords    = (features[0]!.geometry as GeoJSON.Point).coordinates as [number, number]
      ;(map.getSource('fleet') as maplibregl.GeoJSONSource)
        .getClusterExpansionZoom(clusterId)
        .then((zoom: number) => map.easeTo({ center: coords, zoom }))
        .catch(() => {/* ignore */})
    })

    // Truck click → popup (T4 XSS: setDOMContent, never innerHTML with raw data)
    map.on('click', 'fleet-trucks', (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['fleet-trucks'] })
      if (!features.length) return
      const f = features[0]!
      const p = f.properties as Record<string, unknown>
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number]

      // Build popup DOM safely (T-11-06: no innerHTML with user data)
      const container = document.createElement('div')
      container.style.cssText = 'font-size:12px;line-height:1.6;min-width:160px;'

      function addRow(label: string, value: string) {
        const row = document.createElement('div')
        const strong = document.createElement('strong')
        strong.textContent = label + ': '
        const span = document.createElement('span')
        span.textContent = value
        row.appendChild(strong)
        row.appendChild(span)
        container.appendChild(row)
      }

      const motorista   = String(p['motorista']   ?? '—')
      const cidade      = String(p['cidade']      ?? '—')
      const uf          = String(p['uf']          ?? '')
      const dataPosicao = String(p['dataPosicao'] ?? '')
      const veiculo     = String(p['veiculo']     ?? '—')
      // ranked may arrive as string 'true'/'false' (maplibre serialises properties)
      const ranked = p['ranked'] === true || p['ranked'] === 'true'

      addRow('Motorista', motorista)
      addRow('Local', uf ? `${cidade}/${uf}` : cidade)
      addRow('Data', dataPosicao ? formatDate(dataPosicao, 'dd/MM/yyyy HH:mm') : '—')
      addRow('Veículo', veiculo)

      if (ranked) {
        const rank      = p['rank']      != null ? `#${p['rank']}` : '—'
        const pontuacao = p['pontuacao'] != null ? `${p['pontuacao']} pts` : '—'
        const status    = String(p['status'] ?? '—')
        addRow('Rank', `${rank} · ${pontuacao} · ${status}`)
      }

      new maplibregl.Popup({ closeButton: true })
        .setLngLat(coords)
        .setDOMContent(container)
        .addTo(map)
    })

    // Cursor feedback
    map.on('mouseenter', 'fleet-trucks', () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', 'fleet-trucks', () => {
      map.getCanvas().style.cursor = ''
    })
    map.on('mouseenter', 'fleet-clusters', () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', 'fleet-clusters', () => {
      map.getCanvas().style.cursor = ''
    })
  }

  // Update vehicle markers (live layer — DO NOT TOUCH markersRef/usePositionsStore)
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

      {/* Mode toggle + Fleet toggle */}
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
        <div className="w-px bg-border self-stretch" />
        <button
          onClick={() => setShowFleet(v => !v)}
          className={cn('px-3 py-1.5 flex items-center gap-1.5 transition-colors',
            showFleet ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent')}
        >
          <Truck className="h-3 w-3" /> Frota importada
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
          {showFleet && (
            <>
              <div className="mt-1 mb-0.5 text-muted-foreground font-medium">Frota importada</div>
              <div className="flex items-center gap-2 text-foreground"><Truck className="h-2.5 w-2.5 text-[#2dce89]" /> Ativo</div>
              <div className="flex items-center gap-2 text-foreground"><Truck className="h-2.5 w-2.5 text-[#f5365c]" /> Bloqueado</div>
              <div className="flex items-center gap-2 text-foreground"><Truck className="h-2.5 w-2.5 text-[#95959e]" /> Sem match</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
