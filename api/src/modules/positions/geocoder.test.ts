/**
 * Testes unitários do geocoder (D-10-01, D-10-08, T3, T4).
 *
 * Tudo mockado — sem rede real, sem DB real.
 *
 * Casos cobertos:
 *   1. Cache-hit → retorna resultado sem chamar fetch (cache-first).
 *   2. Cache-miss + fetch OK → parse, extrai uf=BA, escreve no cache.
 *   3. Cache-miss + fetch retorna lat=999 (fora de faixa) → geocoded:false (T4).
 *   4. Cache-miss + fetch lança erro de rede → geocoded:false sem throw (best-effort).
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

// ---------------------------------------------------------------------------
// Helpers para construir mock do Drizzle chainable (select/insert)
// ---------------------------------------------------------------------------

function makeSelectMock(rows: Record<string, unknown>[]) {
  const chain = {
    from: () => chain,
    where: () => Promise.resolve(rows),
  }
  return () => chain
}

function makeInsertMock() {
  const chain = {
    values: () => chain,
    onConflictDoNothing: () => Promise.resolve(),
  }
  return () => chain
}

// ---------------------------------------------------------------------------
// Nominatim response fixture — match real
// ---------------------------------------------------------------------------

function makeNominatimItem(opts: {
  lat?: string
  lon?: string
  state?: string
  iso?: string
  city?: string
  displayName?: string
}) {
  return {
    lat: opts.lat ?? '-11.94',
    lon: opts.lon ?? '-38.06',
    display_name: opts.displayName ?? 'Entre Rios, Bahia, Brasil',
    address: {
      ...(opts.city ? { city: opts.city } : { city: 'Entre Rios' }),
      state: opts.state ?? 'Bahia',
      'ISO3166-2-lvl4': opts.iso ?? 'BR-BA',
    },
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('geocodeText', () => {
  // We reset the module registry before each test so that the lazy `getDb()`
  // import picks up our mocked db/client + db/schema.
  let geocodeText: (q: string) => Promise<{ geocoded: boolean; lat: number | null; lng: number | null; cidade: string | null; uf: string | null; displayName: string | null }>

  let mockSelect: ReturnType<typeof mock>
  let mockInsert: ReturnType<typeof mock>
  let originalFetch: typeof globalThis.fetch

  beforeEach(async () => {
    originalFetch = globalThis.fetch

    // Mock geocodeCache table (identity object — only referenced, not called directly by test)
    const geocodeCacheTable = { _: 'geocode_cache' }

    // Will be reconfigured per test
    mockSelect = mock(makeSelectMock([]))
    mockInsert = mock(makeInsertMock())

    const mockDb = {
      select: mockSelect,
      insert: mockInsert,
    }

    // Mock the DB client module
    mock.module('../../db/client', () => ({
      db: mockDb,
    }))

    // Mock the schema module — geocodeCache needs to be the same object
    mock.module('../../db/schema', () => ({
      geocodeCache: geocodeCacheTable,
    }))

    // Default fetch mock: empty array (cache miss with no Nominatim result)
    globalThis.fetch = mock(async (_url: string) => {
      return new Response(JSON.stringify([]), { status: 200 })
    }) as unknown as typeof globalThis.fetch

    // Import geocoder fresh (dynamic import ensures mocks take effect)
    const mod = await import('./geocoder')
    geocodeText = mod.geocodeText
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    mock.restore()
  })

  // -------------------------------------------------------------------------
  // Test 1: Cache-hit — fetch never called
  // -------------------------------------------------------------------------
  it('cache-hit: returns cached result without calling fetch', async () => {
    const cachedRow = {
      query: 'POSTO J REIS - ENTRE RIOS BA',
      lat: '-11.94',
      lng: '-38.06',
      cidade: 'Entre Rios',
      uf: 'BA',
      displayName: 'Entre Rios, Bahia, Brasil',
      provider: 'nominatim',
      createdAt: new Date(),
    }

    // Override select to return the cached row
    mockSelect.mockImplementation(makeSelectMock([cachedRow]))

    const fetchSpy = spyOn(globalThis, 'fetch')

    const result = await geocodeText('POSTO J REIS - ENTRE RIOS BA')

    expect(result.geocoded).toBe(true)
    expect(result.lat).toBeCloseTo(-11.94, 5)
    expect(result.lng).toBeCloseTo(-38.06, 5)
    expect(result.uf).toBe('BA')
    expect(result.cidade).toBe('Entre Rios')
    // Cache-first proven: fetch was NOT called
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Test 2: Cache-miss + fetch OK → parse + uf + cache write
  // -------------------------------------------------------------------------
  it('cache-miss: calls Nominatim, parses uf=BA, writes to cache', async () => {
    // select returns empty (cache miss)
    mockSelect.mockImplementation(makeSelectMock([]))

    const insertSpy = mock(makeInsertMock())
    mockInsert.mockImplementation(insertSpy)

    const nominatimItem = makeNominatimItem({
      lat: '-11.94',
      lon: '-38.06',
      state: 'Bahia',
      iso: 'BR-BA',
      city: 'Entre Rios',
    })

    globalThis.fetch = mock(async (_url: string) => {
      return new Response(JSON.stringify([nominatimItem]), { status: 200 })
    }) as unknown as typeof globalThis.fetch

    const result = await geocodeText('ENTRE RIOS BA')

    expect(result.geocoded).toBe(true)
    expect(result.lat).toBeCloseTo(-11.94, 5)
    expect(result.lng).toBeCloseTo(-38.06, 5)
    expect(result.uf).toBe('BA')
    expect(result.cidade).toBe('Entre Rios')
    // Cache write must have been called
    expect(mockInsert).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Test 3: lat=999 (fora de faixa) → geocoded:false, lat null (T4)
  // -------------------------------------------------------------------------
  it('range validation: lat=999 treated as miss (geocoded:false)', async () => {
    mockSelect.mockImplementation(makeSelectMock([]))

    const badItem = makeNominatimItem({ lat: '999', lon: '-38.06' })
    globalThis.fetch = mock(async (_url: string) => {
      return new Response(JSON.stringify([badItem]), { status: 200 })
    }) as unknown as typeof globalThis.fetch

    const result = await geocodeText('LUGAR INVALIDO BA')

    expect(result.geocoded).toBe(false)
    expect(result.lat).toBeNull()
    expect(result.lng).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Test 4: fetch throws → geocoded:false sem propagar erro (best-effort)
  // -------------------------------------------------------------------------
  it('best-effort: fetch error does not propagate (returns geocoded:false)', async () => {
    mockSelect.mockImplementation(makeSelectMock([]))

    globalThis.fetch = mock(async (_url: string) => {
      throw new Error('Network error')
    }) as unknown as typeof globalThis.fetch

    let threw = false
    let result: Awaited<ReturnType<typeof geocodeText>> | null = null
    try {
      result = await geocodeText('ALGUM LUGAR BA')
    } catch {
      threw = true
    }

    expect(threw).toBe(false)
    expect(result).not.toBeNull()
    expect(result!.geocoded).toBe(false)
    expect(result!.lat).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Test 5: empty query → immediate return without cache/fetch
  // -------------------------------------------------------------------------
  it('empty query: returns geocoded:false without touching DB or fetch', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch')

    const result = await geocodeText('   ')

    expect(result.geocoded).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
    // select should not be called either
    expect(mockSelect).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// extractLocality — pura, sem DB/rede (Phase 10 deviation-fix do texto sujo)
// ---------------------------------------------------------------------------

describe('extractLocality', () => {
  it('extrai CIDADE, UF do fim (UF separada por espaço)', async () => {
    const { extractLocality } = await import('./geocoder')
    expect(extractLocality('0.03 Km - POSTO J REIS - ENTRE RIOS BA')).toBe('ENTRE RIOS, BA, Brasil')
  })

  it('lida com sufixo /UF e remove asteriscos', async () => {
    const { extractLocality } = await import('./geocoder')
    expect(extractLocality('2.63 Km - CHONIN DE BAIXO/MG*')).toBe('CHONIN DE BAIXO, MG, Brasil')
  })

  it('lida com sufixo -UF e descarta prefixos de landmark/rodovia', async () => {
    const { extractLocality } = await import('./geocoder')
    expect(extractLocality('0.01 Km - PT PICHILAU - BR104 KM112 - MESSIAS-AL')).toBe('MESSIAS, AL, Brasil')
  })

  it('sem UF: usa o último segmento " - " + Brasil', async () => {
    const { extractLocality } = await import('./geocoder')
    expect(extractLocality('0.10 Km - CBD - CABO DE SANTO AGOSTINHO')).toBe('CABO DE SANTO AGOSTINHO, Brasil')
  })
})
