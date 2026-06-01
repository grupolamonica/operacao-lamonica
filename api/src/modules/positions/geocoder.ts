/**
 * Geocoder: Nominatim cache-first + rate-limit 1/s + best-effort (D-10-01, D-10-08).
 *
 * - Cache-first: consulta geocode_cache ANTES de bater no Nominatim.
 *   Cache-hit não consome slot de rate-limit.
 * - Rate-limit: singleton sequencial ≥1000ms entre requests HTTP (ToS T3).
 * - Best-effort: qualquer falha retorna { geocoded:false } sem propagar erro.
 * - Validação de faixa: lat∈[-90,90], lng∈[-180,180] (T4); inválido → miss.
 * - Grava cache inclusive em miss (lat/lng null) para não re-bater (D-10-08).
 * - Sem log do conteúdo das queries/coordenadas (T5).
 */

import { eq } from 'drizzle-orm'

// Lazy DB import: client.ts lança em module-eval se DATABASE_URL ausente.
// Diferir para call-time evita crash ao importar geocoder em testes sem DB.
async function getDb() {
  const { db } = await import('../../db/client')
  const { geocodeCache } = await import('../../db/schema')
  return { db, geocodeCache }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeocodeResult {
  geocoded: boolean
  lat: number | null
  lng: number | null
  cidade: string | null
  uf: string | null
  displayName: string | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ??
  'TorreDeControle/1.0 (contato interno Lamonica)'

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'

const RATE_LIMIT_MS = 1000

// ---------------------------------------------------------------------------
// UF mapping — address.state (nome por extenso) → sigla 2 letras
// Também suporta ISO3166-2-lvl4 "BR-XX" → "XX"
// ---------------------------------------------------------------------------

const STATE_NAME_TO_UF: Record<string, string> = {
  'Acre': 'AC',
  'Alagoas': 'AL',
  'Amapá': 'AP',
  'Amazonas': 'AM',
  'Bahia': 'BA',
  'Ceará': 'CE',
  'Distrito Federal': 'DF',
  'Espírito Santo': 'ES',
  'Goiás': 'GO',
  'Maranhão': 'MA',
  'Mato Grosso': 'MT',
  'Mato Grosso do Sul': 'MS',
  'Minas Gerais': 'MG',
  'Pará': 'PA',
  'Paraíba': 'PB',
  'Paraná': 'PR',
  'Pernambuco': 'PE',
  'Piauí': 'PI',
  'Rio de Janeiro': 'RJ',
  'Rio Grande do Norte': 'RN',
  'Rio Grande do Sul': 'RS',
  'Rondônia': 'RO',
  'Roraima': 'RR',
  'Santa Catarina': 'SC',
  'São Paulo': 'SP',
  'Sergipe': 'SE',
  'Tocantins': 'TO',
}

function resolveUf(address: Record<string, string>): string | null {
  // Prefer ISO3166-2-lvl4 = "BR-BA" → "BA"
  const iso = address['ISO3166-2-lvl4']
  if (iso && /^BR-[A-Z]{2}$/.test(iso)) {
    return iso.slice(3)
  }
  // Fallback: state name → map
  const stateName = address.state
  if (stateName && STATE_NAME_TO_UF[stateName]) {
    return STATE_NAME_TO_UF[stateName]
  }
  return null
}

function resolveCidade(address: Record<string, string>): string | null {
  return (
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    null
  )
}

// ---------------------------------------------------------------------------
// extractLocality — a Posição é texto sujo ("0.03 Km - POSTO J REIS - ENTRE
// RIOS BA"); Nominatim não resolve a string inteira. Extrai "CIDADE, UF, Brasil"
// do FIM (cidade+UF ficam após o último " - "). Confirmado: a query crua → 0
// resultados; "Entre Rios, BA, Brasil" → acerta. Granularidade cidade/UF (D-10-01).
// ---------------------------------------------------------------------------

const UF_SET = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
])

export function extractLocality(raw: string): string {
  // 1. Tira o prefixo de distância "X.XX Km - "
  let s = raw.replace(/^\s*[\d.,]+\s*km\s*-\s*/i, '').trim()
  // 2. Remove ruído: asteriscos, parênteses; normaliza espaços
  s = s.replace(/\*+/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  // 3. UF de 2 letras no fim, após espaço/hífen/barra ("ENTRE RIOS BA", "MESSIAS-AL", "CHONIN DE BAIXO/MG")
  const m = s.match(/[\s/-]([A-Za-z]{2})$/)
  if (m && UF_SET.has(m[1].toUpperCase())) {
    const uf = m[1].toUpperCase()
    const head = s.slice(0, m.index).replace(/[\s/-]+$/, '').trim()
    // cidade = último segmento " - " do head (descarta prefixos de landmark/rodovia)
    const segs = head.split(/\s+-\s+/)
    const city = (segs[segs.length - 1] || head).trim()
    return city ? `${city}, ${uf}, Brasil` : `${uf}, Brasil`
  }
  // 4. Sem UF clara: usa o último segmento " - " como localidade
  const segs = s.split(/\s+-\s+/)
  const tail = (segs[segs.length - 1] || s).trim()
  return tail ? `${tail}, Brasil` : raw
}

// ---------------------------------------------------------------------------
// Lat/lng range validation (T4)
// ---------------------------------------------------------------------------

function isValidLat(v: number): boolean {
  return !isNaN(v) && v >= -90 && v <= 90
}

function isValidLng(v: number): boolean {
  return !isNaN(v) && v >= -180 && v <= 180
}

// ---------------------------------------------------------------------------
// Rate-limiter singleton — serializa HTTP ao Nominatim, ≥1000ms entre calls
// Cache-hit NÃO passa por aqui.
// ---------------------------------------------------------------------------

let _lastCallPromise: Promise<unknown> = Promise.resolve()

function rateLimitedFetch(url: string): Promise<Response> {
  const result = _lastCallPromise.then(async () => {
    const start = Date.now()
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    })
    const elapsed = Date.now() - start
    const gap = RATE_LIMIT_MS - elapsed
    if (gap > 0) {
      await new Promise((r) => setTimeout(r, gap))
    }
    return response
  })
  // Encadeia na fila (even if caller error, next waits for this slot)
  _lastCallPromise = result.then(
    () => {},
    () => {},
  )
  return result
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const EMPTY_MISS: GeocodeResult = {
  geocoded: false,
  lat: null,
  lng: null,
  cidade: null,
  uf: null,
  displayName: null,
}

export async function geocodeText(query: string): Promise<GeocodeResult> {
  const q = query.trim()
  if (!q) return EMPTY_MISS

  // -------------------------------------------------------------------------
  // 1. Cache-first (D-10-08): SELECT antes de qualquer fetch.
  // -------------------------------------------------------------------------
  try {
    const { db, geocodeCache } = await getDb()
    const rows = await db
      .select()
      .from(geocodeCache)
      .where(eq(geocodeCache.query, q))

    if (rows.length > 0) {
      const row = rows[0]
      const lat = row.lat !== null ? parseFloat(String(row.lat)) : null
      const lng = row.lng !== null ? parseFloat(String(row.lng)) : null
      return {
        geocoded: lat !== null && lng !== null,
        lat,
        lng,
        cidade: row.cidade ?? null,
        uf: row.uf ?? null,
        displayName: row.displayName ?? null,
      }
    }
  } catch {
    // DB indisponível — best-effort: tenta Nominatim mesmo assim
  }

  // -------------------------------------------------------------------------
  // 2. Miss: bate no Nominatim com rate-limit (ToS T3).
  // -------------------------------------------------------------------------
  let result: GeocodeResult = { ...EMPTY_MISS }

  try {
    // Nominatim não resolve o texto cru — extrai "CIDADE, UF, Brasil" do fim.
    const searchQuery = extractLocality(q)
    const url =
      `${NOMINATIM_BASE}?q=${encodeURIComponent(searchQuery)}` +
      `&format=json&countrycodes=br&limit=1&addressdetails=1`

    const response = await rateLimitedFetch(url)
    const data = (await response.json()) as Array<{
      lat: string
      lon: string
      display_name: string
      address: Record<string, string>
    }>

    if (Array.isArray(data) && data.length > 0) {
      const item = data[0]
      const lat = parseFloat(item.lat)
      const lng = parseFloat(item.lon)

      // Validação de faixa (T4): inválido → miss
      if (isValidLat(lat) && isValidLng(lng)) {
        result = {
          geocoded: true,
          lat,
          lng,
          cidade: resolveCidade(item.address),
          uf: resolveUf(item.address),
          displayName: item.display_name ?? null,
        }
      }
      // lat/lng fora de faixa → result permanece EMPTY_MISS (miss)
    }
    // Array vazio → miss (result permanece EMPTY_MISS)
  } catch {
    // Falha de rede / parse → best-effort, result permanece EMPTY_MISS
  }

  // -------------------------------------------------------------------------
  // 3. Grava cache (inclusive miss) — idempotente via ON CONFLICT DO NOTHING.
  //    Miss gravado com lat/lng null para não re-bater (D-10-08).
  // -------------------------------------------------------------------------
  try {
    const { db, geocodeCache } = await getDb()
    await db
      .insert(geocodeCache)
      .values({
        query: q,
        lat: result.lat !== null ? String(result.lat) : null,
        lng: result.lng !== null ? String(result.lng) : null,
        cidade: result.cidade,
        uf: result.uf,
        displayName: result.displayName,
        provider: 'nominatim',
      })
      .onConflictDoNothing()
  } catch {
    // DB indisponível — best-effort: cache write failure não derruba o caller
  }

  return result
}
