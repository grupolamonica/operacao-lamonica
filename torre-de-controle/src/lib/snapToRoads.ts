/**
 * snapToRoads.ts — encaixa o traçado bruto de GPS na malha viária (OSRM).
 *
 * Os pontos de driver_positions são esparsos (consultas Angellira, não telemetria
 * de alta frequência). Ligar pontos consecutivos com retas faz a "rota" cortar
 * onde não há pista. Aqui passamos os pontos como waypoints ao OSRM /route, que
 * devolve a geometria seguindo as estradas reais entre cada posição.
 *
 * Keyless: usa o servidor OSRM público por padrão (configurável via VITE_OSRM_URL).
 * Degradação graciosa: se o OSRM falhar (rede, rate-limit, trecho sem via), o
 * trecho correspondente cai de volta para a reta crua — a linha nunca quebra.
 */

export type LngLat = [number, number]

const OSRM_URL = (import.meta.env.VITE_OSRM_URL as string | undefined)?.replace(/\/$/, '')
  ?? 'https://router.project-osrm.org'

// OSRM público limita coordenadas por requisição (100 no /route). Mantemos ≤95
// p/ rotear o trajeto inteiro numa ÚNICA requisição — sem emendar chunks (emenda
// entre trecho encaixado e trecho cru gera descontinuidade/corte) e com 1 só
// chamada (menos exposição a rate-limit).
const MAX_WAYPOINTS = 95
// Colapsa pontos muito próximos (caminhão parado/cluster) antes de rotear —
// reduz nº de waypoints sem perder o formato do trajeto.
const MIN_POINT_SPACING_M = 120

function haversineMeters(a: LngLat, b: LngLat): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(a[0] - b[0]) * -1 // ordem irrelevante p/ distância
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Remove pontos a menos de MIN_POINT_SPACING_M do último mantido; preserva 1º e último. */
function downsample(coords: LngLat[]): LngLat[] {
  if (coords.length <= 2) return coords
  const out: LngLat[] = [coords[0]!]
  for (let i = 1; i < coords.length - 1; i++) {
    if (haversineMeters(out[out.length - 1]!, coords[i]!) >= MIN_POINT_SPACING_M) {
      out.push(coords[i]!)
    }
  }
  out.push(coords[coords.length - 1]!)
  return out
}

/** Subamostra para no máximo `max` pontos, igualmente espaçados, mantendo 1º e último. */
function capWaypoints(coords: LngLat[], max: number): LngLat[] {
  if (coords.length <= max) return coords
  const out: LngLat[] = []
  const step = (coords.length - 1) / (max - 1)
  for (let i = 0; i < max; i++) out.push(coords[Math.round(i * step)]!)
  return out
}

function fmt(c: LngLat): string {
  // 5 casas ≈ 1m de precisão — encurta a URL.
  return `${c[0].toFixed(5)},${c[1].toFixed(5)}`
}

/** Rota seguindo as vias entre TODOS os waypoints, numa única chamada. null em falha. */
async function routeAll(coords: LngLat[], signal?: AbortSignal): Promise<LngLat[] | null> {
  if (coords.length < 2) return null
  const path = coords.map(fmt).join(';')
  const url = `${OSRM_URL}/route/v1/driving/${path}?overview=full&geometries=geojson&steps=false`
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const json = (await res.json()) as {
      code?: string
      routes?: Array<{ geometry?: { coordinates?: LngLat[] } }>
    }
    if (json.code !== 'Ok') return null
    const geom = json.routes?.[0]?.geometry?.coordinates
    return Array.isArray(geom) && geom.length >= 2 ? geom : null
  } catch {
    return null // rede/abort/rate-limit → cai para a reta crua
  }
}

/**
 * Recebe os pontos brutos do trajeto (ordem cronológica) e devolve a polyline
 * encaixada nas vias, numa ÚNICA requisição OSRM (sem emendar chunks). Se o OSRM
 * falhar, devolve a reta crua já reduzida (downsample) — nunca devolve vazio se
 * havia ≥2 pontos. A linha é sempre contínua: tudo encaixado, ou tudo reta.
 */
export async function snapTrackToRoads(
  points: Array<{ lat: number; lng: number }>,
  signal?: AbortSignal,
): Promise<LngLat[]> {
  const raw: LngLat[] = points
    .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat))
    .map((p) => [p.lng, p.lat])
  // Remove pontos consecutivos idênticos (backtrack/duplicata no OSRM).
  const dedup: LngLat[] = raw.filter((c, i) => i === 0 || c[0] !== raw[i - 1]![0] || c[1] !== raw[i - 1]![1])
  if (dedup.length < 2) return dedup

  // ≤MAX_WAYPOINTS pontos → 1 só chamada /route (sem emenda de chunks).
  const coords = capWaypoints(downsample(dedup), MAX_WAYPOINTS)
  const snapped = await routeAll(coords, signal)
  return snapped && snapped.length >= 2 ? snapped : coords
}
