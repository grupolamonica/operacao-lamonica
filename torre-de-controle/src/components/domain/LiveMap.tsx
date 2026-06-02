import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapIcon, Satellite, Truck, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePositionsStore } from '@/hooks/useVehiclePositions'
import { useFleetPositions, type FleetPosition } from '@/hooks/useFleetPositions'
import { useGeofences, type Geofence } from '@/hooks/useGeofences'
import { useTrips } from '@/hooks/useTrips'
import { RISK_HEX } from '@/components/domain/RiskBadge'
import { formatDate } from '@/lib/formatters'
import type { RiskLevel } from '@/data/types'

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

  // SEM clustering (D-11-05 revisado pelo usuário): mostrar TODOS os motoristas
  // como caminhão em qualquer zoom, mesmo muito distantes/sobrepostos.
  map.addSource('fleet', {
    type: 'geojson',
    data: geojson,
  })

  // Símbolo de caminhão por motorista (SDF recolorido por status via icon-color).
  // icon-allow-overlap:true → todos visíveis mesmo sobrepostos. icon-size
  // interpola por zoom (menor quando afastado p/ não virar uma bolha única).
  map.addLayer({
    id:     'fleet-trucks',
    type:   'symbol',
    source: 'fleet',
    layout: {
      'icon-image':          'truck-icon',
      'icon-size':           ['interpolate', ['linear'], ['zoom'], 3, 0.55, 6, 0.75, 10, 0.95],
      'icon-allow-overlap':  true,
      'icon-ignore-placement': true,
      'text-field':          '',
    },
    paint: {
      'icon-color': ['get', 'color'],
    },
  })
}

/** Add/update geofence fill + outline layers. Only active fences rendered. */
function renderGeofences(map: maplibregl.Map, fences: Geofence[]) {
  const active = fences.filter((f) => f.isActive)
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: active.map((f) => ({
      type: 'Feature' as const,
      properties: { color: f.color, name: f.name, type: f.type },
      geometry: { type: 'Polygon' as const, coordinates: f.coordinates },
    })),
  }

  if (map.getSource('fences')) {
    ;(map.getSource('fences') as maplibregl.GeoJSONSource).setData(geojson)
    return
  }

  map.addSource('fences', { type: 'geojson', data: geojson })
  map.addLayer({ id: 'fences-fill', type: 'fill',   source: 'fences', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 } })
  map.addLayer({ id: 'fences-line', type: 'line',   source: 'fences', paint: { 'line-color': ['get', 'color'], 'line-width': 2 } })
}

/** Remove geofence layers + source */
function removeGeofences(map: maplibregl.Map) {
  if (map.getLayer('fences-fill')) map.removeLayer('fences-fill')
  if (map.getLayer('fences-line')) map.removeLayer('fences-line')
  if (map.getSource('fences'))     map.removeSource('fences')
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
  const modeInitRef          = useRef(true)   // pula o setStyle inicial (estilo já correto) — não derruba a camada de frota
  const [mode, setMode]      = useState<'mapa' | 'satelite'>('mapa')
  const [mapReady, setMapReady] = useState(false)
  const [showFleet, setShowFleet] = useState(false)  // default OFF (D-11-06)

  // Read from global positions store (WS managed in AppLayout)
  const positions = usePositionsStore(s => s.positions)
  const connected = usePositionsStore(s => s.connected)

  // Fleet positions — only fetch when layer is on (enabled gate)
  const { data: fleet } = useFleetPositions({ enabled: showFleet })

  // Geofences — always fetch; render when map is ready
  const { data: geofences } = useGeofences()

  // Trips for risk-tinting the marker border. Light fetch; reused across panels.
  const { data: tripsForRisk } = useTrips({ status: 'in_progress' })
  const riskByVehicleId = useMemo(() => {
    const m = new Map<string, RiskLevel>()
    for (const t of tripsForRisk ?? []) {
      if (t.riskLevel && (t as any).vehicleId) m.set((t as any).vehicleId, t.riskLevel)
      // Fallback: try matching by plate when vehicleId is not in the DTO
    }
    return m
  }, [tripsForRisk])

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

    const markReady = () => setMapReady(true)
    map.on('load', () => { map.resize(); markReady() })
    // Fallback: em alguns ambientes o 'load' não dispara (recurso de CDN do basemap
    // bloqueado/lento). 'idle' (1º render assentado) + timeout garantem que mapReady
    // vire true e a camada de frota renderize mesmo assim. setMapReady é idempotente.
    map.on('idle', markReady)
    const readyFallback = setTimeout(markReady, 2500)

    mapRef.current = map

    return () => {
      clearTimeout(readyFallback)
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
    // Pula a 1ª execução (quando mapReady vira true): o estilo já é TILE_STYLES[mode]
    // do init. Re-setStyle aqui derrubava a camada de frota recém-renderizada (o
    // 'styledata' tentava re-renderizar mas era gated por isStyleLoaded() flaky).
    if (modeInitRef.current) { modeInitRef.current = false; return }
    const map = mapRef.current

    map.setStyle(TILE_STYLES[mode])

    // Re-register truck image + fleet layers after style swap
    map.once('styledata', () => {
      registerTruckImage(map)
      setTimeout(() => {
        if (map.isStyleLoaded()) {
          if (geofences.length > 0) renderGeofences(map, geofences)
          if (showFleet && fleet.length > 0) {
            renderFleet(map, fleet)
            registerFleetHandlers(map)
          }
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
      // addSource/addLayer EXIGEM isStyleLoaded()===true (senão maplibre lança
      // "Style is not done loading" e o error boundary derruba o mapa). O estilo
      // pode ainda estar carregando quando os dados chegam → renderiza só quando
      // pronto; senão re-tenta no próximo 'idle' (dispara ao terminar o estilo).
      const doRender = () => {
        if (!map.isStyleLoaded()) { map.once('idle', doRender); return }
        registerTruckImage(map)
        renderFleet(map, fleet)
        registerFleetHandlers(map)
        // fitBounds nas posições UMA vez por ativação — senão o mapa fica no
        // center default (SP) e os caminhões (NE/MG) ficam fora do viewport.
        if (!fleetFittedRef.current) {
          // Filtra à extensão do Brasil só p/ o CÁLCULO do fit (um geocode outlier
          // não deve jogar o center pro oceano). Marcadores fora ainda renderizam.
          const pts = fleet.filter(
            (f) => Number.isFinite(f.lng) && Number.isFinite(f.lat) &&
              f.lng >= -74 && f.lng <= -34 && f.lat >= -34 && f.lat <= 6,
          )
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

      // Build popup DOM safely (T-11-06: no innerHTML with user data).
      // Estilo: mini-card Argon (tokens var(--card)/--border etc.), mantendo
      // a montagem 100% por textContent (sem innerHTML).
      const container = document.createElement('div')
      container.style.cssText =
        "background: var(--card); color: var(--card-foreground); border-radius: 0.75rem; box-shadow: 0 0 1.5rem 0 rgba(136,152,170,0.25); border: 1px solid var(--border); padding: 0.75rem 0.875rem; font-family: 'Open Sans', system-ui, sans-serif; font-size: 12px; line-height: 1.5; min-width: 190px;"

      function addRow(label: string, value: string, opts?: { titleRow?: boolean }) {
        const row = document.createElement('div')
        const strong = document.createElement('strong')
        strong.textContent = label + ': '
        const span = document.createElement('span')
        span.textContent = value
        if (opts?.titleRow) {
          row.style.fontWeight = '600'
        }
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

      addRow('Motorista', motorista, { titleRow: true })
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

  // Geofence layer — render active fences when map is ready or data changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const doRender = () => {
      if (!map.isStyleLoaded()) { map.once('idle', doRender); return }
      if (geofences.length > 0) renderGeofences(map, geofences)
      else removeGeofences(map)
    }
    doRender()
  }, [geofences, mapReady])

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
      const risk       = riskByVehicleId.get(id)
      const riskColor  = risk ? RISK_HEX[risk] : 'white'
      const isSelected = id === selectedVehicleId
      const size       = isSelected ? '20px' : '14px'

      if (!markersRef.current.has(id)) {
        const el = document.createElement('div')
        el.style.cssText = `width:${size};height:${size};border-radius:50%;background:${color};border:2px solid ${riskColor};box-shadow:0 2px 4px rgba(0,0,0,.4);cursor:pointer;transition:all .15s;`
        el.title = `${id.slice(0, 8)} — ${pos.slaStatus}${risk ? ` · risco ${risk}` : ''}`
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
        el.style.borderColor = riskColor
        el.style.width  = size
        el.style.height = size
      }
    }
  }, [positions, selectedVehicleId, onVehicleClick, mapReady, riskByVehicleId])

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
          <div className="mt-1 mb-0.5 text-muted-foreground font-medium">Risco (borda)</div>
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-transparent border-2" style={{ borderColor: RISK_HEX.critico }} /> Crítico</div>
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-transparent border-2" style={{ borderColor: RISK_HEX.alto }} /> Alto</div>
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-transparent border-2" style={{ borderColor: RISK_HEX.medio }} /> Médio</div>
          <div className="flex items-center gap-2 text-foreground"><span className="h-2.5 w-2.5 rounded-full bg-transparent border-2" style={{ borderColor: RISK_HEX.baixo }} /> Baixo</div>
          {showFleet && (
            <>
              <div className="mt-1 mb-0.5 text-muted-foreground font-medium">Frota importada</div>
              <div className="flex items-center gap-2 text-foreground"><Truck className="h-2.5 w-2.5" style={{ color: FLEET_COLORS.ATIVO }} /> Ativo</div>
              <div className="flex items-center gap-2 text-foreground"><Truck className="h-2.5 w-2.5" style={{ color: FLEET_COLORS.BLOQUEADO }} /> Bloqueado</div>
              <div className="flex items-center gap-2 text-foreground"><Truck className="h-2.5 w-2.5" style={{ color: FLEET_COLORS.neutral }} /> Sem match</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
