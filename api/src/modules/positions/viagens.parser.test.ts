/**
 * Testes unitários do parser Viagens.xlsx (D-10-05 + D-10-06).
 *
 * Fixture completamente sintética (in-memory via XLSX.utils) — sem
 * dependência de rede, DB, Redis ou arquivo externo ao repo.
 *
 * Aba "Página1", índices 0-based (confirmados contra o arquivo real):
 *   12 = Veículo (coluna M)
 *   15 = Motorista (coluna P)
 *   16 = Data Posição (coluna Q)  "dd/MM/yyyy HH:mm:ss"
 *   18 = Posição (coluna S)
 */

import * as XLSX from 'xlsx'
import { describe, expect, it } from 'bun:test'

import { normalizeMotorista, parseViagensXlsx } from './viagens.parser'

// ---------------------------------------------------------------------------
// Helper: monta buffer xlsx a partir de linhas brutas (array-of-arrays)
// ---------------------------------------------------------------------------

/**
 * Constrói um buffer .xlsx com a aba "Página1" contendo as linhas fornecidas.
 * A primeira entrada de `rows` é o header (linha 0 da planilha).
 */
function buildXlsxBuffer(rows: string[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const wb    = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Página1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

/**
 * Cria uma linha com 68 colunas (todas vazias por padrão) e preenche apenas
 * os índices relevantes ao parser.
 */
function makeRow(opts: {
  motorista?: string
  data?: string
  posicao?: string
  veiculo?: string
}): string[] {
  const row = Array<string>(68).fill('')
  if (opts.motorista !== undefined) row[15] = opts.motorista  // coluna P
  if (opts.data      !== undefined) row[16] = opts.data       // coluna Q
  if (opts.posicao   !== undefined) row[18] = opts.posicao    // coluna S
  if (opts.veiculo   !== undefined) row[12] = opts.veiculo    // coluna M
  return row
}

// ---------------------------------------------------------------------------
// Header sintético (só precisa existir — o parser o pula)
// ---------------------------------------------------------------------------

const HEADER = makeRow({
  motorista: 'Motorista',
  data:      'Data Posição',
  posicao:   'Posição',
  veiculo:   'Veículo',
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROW_ADAUTO: string[] = makeRow({
  motorista: 'Adauto Santos Costa',
  data:      '31/05/2026 14:30:00',
  posicao:   '0.03 Km - POSTO J REIS - ENTRE RIOS BA',
  veiculo:   'ABC1234',
})

const ROW_ACCENTED: string[] = makeRow({
  motorista: '  Adáuto   santos COSTA ',
  data:      '31/05/2026 14:30:00',
  posicao:   'Rua Teste - SAO PAULO SP',
  veiculo:   'XYZ5678',
})

const ROW_THIRD: string[] = makeRow({
  motorista: 'JOAO DA SILVA',
  data:      '29/05/2026 08:00:00',
  posicao:   'CENTRO - SALVADOR BA',
  veiculo:   'DEF9012',
})

const ROW_NO_MOTORISTA_EMPTY: string[] = makeRow({
  motorista: '',
  data:      '31/05/2026 14:30:00',
  posicao:   'Algum lugar',
})

const ROW_NO_MOTORISTA_WHITESPACE: string[] = makeRow({
  motorista: '   ',
  data:      '31/05/2026 14:30:00',
  posicao:   'Outro lugar',
})

const ROW_INVALID_DATE: string[] = makeRow({
  motorista: 'CARLOS PEREIRA',
  data:      'not-a-date',
  posicao:   'BRASILIA DF',
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('normalizeMotorista', () => {
  it('removes accents, collapses spaces, uppercases', () => {
    expect(normalizeMotorista('  Adáuto   santos COSTA ')).toBe('ADAUTO SANTOS COSTA')
  })

  it('handles already-normalized input', () => {
    expect(normalizeMotorista('ADAUTO SANTOS COSTA')).toBe('ADAUTO SANTOS COSTA')
  })

  it('handles various accented chars', () => {
    expect(normalizeMotorista('José Ângelo Tião')).toBe('JOSE ANGELO TIAO')
  })

  it('collapses multiple internal spaces', () => {
    expect(normalizeMotorista('JOSE   DA   SILVA')).toBe('JOSE DA SILVA')
  })
})

describe('parseViagensXlsx', () => {
  describe('only-motorista filter', () => {
    it('returns only rows with non-empty Motorista (3 of 5)', () => {
      const buf = buildXlsxBuffer([
        HEADER,
        ROW_ADAUTO,
        ROW_NO_MOTORISTA_EMPTY,
        ROW_ACCENTED,
        ROW_NO_MOTORISTA_WHITESPACE,
        ROW_THIRD,
      ])
      const result = parseViagensXlsx(buf)
      expect(result.length).toBe(3)
    })

    it('returns empty array when no rows have Motorista', () => {
      const buf = buildXlsxBuffer([HEADER, ROW_NO_MOTORISTA_EMPTY])
      expect(parseViagensXlsx(buf).length).toBe(0)
    })
  })

  describe('motorista_norm (D-10-06)', () => {
    it('motoristaNorm matches canonical ranking format (accented input)', () => {
      const buf    = buildXlsxBuffer([HEADER, ROW_ACCENTED])
      const result = parseViagensXlsx(buf)
      expect(result[0]?.motoristaNorm).toBe('ADAUTO SANTOS COSTA')
    })

    it('preserves original motorista field as-is (after trim)', () => {
      const buf    = buildXlsxBuffer([HEADER, ROW_ADAUTO])
      const result = parseViagensXlsx(buf)
      // raw trim happens inside the parser (col value trimmed before check)
      expect(result[0]?.motorista).toBe('Adauto Santos Costa')
    })
  })

  describe('data_posicao TZ America/Sao_Paulo (UTC-03)', () => {
    it('parses 31/05/2026 14:30:00 as 17:30:00Z (UTC+03 offset)', () => {
      const buf    = buildXlsxBuffer([HEADER, ROW_ADAUTO])
      const result = parseViagensXlsx(buf)
      expect(result[0]?.dataPosicao.toISOString()).toBe('2026-05-31T17:30:00.000Z')
    })

    it('parses 29/05/2026 08:00:00 as 11:00:00Z', () => {
      const buf    = buildXlsxBuffer([HEADER, ROW_THIRD])
      const result = parseViagensXlsx(buf)
      expect(result[0]?.dataPosicao.toISOString()).toBe('2026-05-29T11:00:00.000Z')
    })
  })

  describe('posicaoRaw preservation', () => {
    it('preserves posicaoRaw exactly', () => {
      const buf    = buildXlsxBuffer([HEADER, ROW_ADAUTO])
      const result = parseViagensXlsx(buf)
      expect(result[0]?.posicaoRaw).toBe('0.03 Km - POSTO J REIS - ENTRE RIOS BA')
    })
  })

  describe('veiculo field', () => {
    it('extracts veiculo (placa) when present', () => {
      const buf    = buildXlsxBuffer([HEADER, ROW_ADAUTO])
      const result = parseViagensXlsx(buf)
      expect(result[0]?.veiculo).toBe('ABC1234')
    })

    it('sets veiculo to null when empty', () => {
      const row = makeRow({ motorista: 'TESTE MOTORISTA', data: '01/01/2026 10:00:00', posicao: 'Lugar X' })
      const buf = buildXlsxBuffer([HEADER, row])
      const result = parseViagensXlsx(buf)
      expect(result[0]?.veiculo).toBeNull()
    })
  })

  describe('invalid date handling', () => {
    it('discards row with invalid date without throwing', () => {
      const buf = buildXlsxBuffer([HEADER, ROW_ADAUTO, ROW_INVALID_DATE, ROW_THIRD])
      // ROW_INVALID_DATE has bad date → discarded; 2 valid rows remain
      const result = parseViagensXlsx(buf)
      expect(result.length).toBe(2)
    })

    it('does not throw for fully empty sheet (only header)', () => {
      const buf = buildXlsxBuffer([HEADER])
      expect(() => parseViagensXlsx(buf)).not.toThrow()
    })
  })
})
