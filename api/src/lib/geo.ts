/**
 * Helpers geográficos.
 *
 * circleToPolygon — converte um círculo (centro + raio em metros) num anel
 * GeoJSON de polígono. O sistema de geofence da Torre (renderer MapLibre,
 * coluna PostGIS geom, detector ray-casting) trabalha só com polígonos; as
 * docas SPX são círculos (station lat/lng + station_range), então geramos um
 * polígono de aproximação para elas fluírem pelo mesmo caminho sem mudanças.
 */

const EARTH_M_PER_DEG_LAT = 111_320

/**
 * @param centerLng longitude do centro
 * @param centerLat latitude do centro
 * @param radiusM   raio em metros
 * @param points    nº de vértices (default 32) — mais = círculo mais liso
 * @returns coordenadas GeoJSON Polygon: [[[lng,lat],...]] (anel fechado)
 */
export function circleToPolygon(
  centerLng: number,
  centerLat: number,
  radiusM: number,
  points = 32,
): number[][][] {
  const latDeg = radiusM / EARTH_M_PER_DEG_LAT
  const lngDeg = radiusM / (EARTH_M_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180))
  const ring: number[][] = []
  for (let i = 0; i < points; i++) {
    const a = (2 * Math.PI * i) / points
    ring.push([centerLng + lngDeg * Math.cos(a), centerLat + latDeg * Math.sin(a)])
  }
  ring.push(ring[0]!) // fecha o anel
  return [ring]
}
