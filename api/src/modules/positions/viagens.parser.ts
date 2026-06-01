/**
 * Parser do Viagens.xlsx (Phase 10 — D-10-05, D-10-06).
 *
 * Lê um buffer .xlsx e retorna SOMENTE as linhas com Motorista não-vazio
 * (~125 de 1540). Parse de data em fuso America/Sao_Paulo (offset fixo
 * UTC-03 — Brasil sem DST desde 2019). Normaliza o nome para join futuro
 * com o ranking (D-10-06).
 *
 * Segurança (T2): cellFormula:false + cellHTML:false — NÃO avalia fórmulas
 * nem conteúdo HTML embutido na planilha.
 * Segurança (T5): não loga valores de linha (nomes/posições).
 */

import * as XLSX from 'xlsx'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ParsedPosition {
  motorista: string
  motoristaNorm: string
  dataPosicao: Date
  posicaoRaw: string
  veiculo: string | null
}

// ---------------------------------------------------------------------------
// Column indices (0-based, aba "Página1")
// col12=Veículo, col15=Motorista, col16=Data Posição, col18=Posição
// ---------------------------------------------------------------------------

// Índices 0-based confirmados contra o arquivo real (SheetJS header:1, coluna A=0):
// M=Veículo(12), P=Motorista(15), Q=Data Posição(16), S=Posição(18).
const COL_VEICULO   = 12  // "Veículo" (coluna M)
const COL_MOTORISTA = 15  // "Motorista" (coluna P)
const COL_DATA      = 16  // "Data Posição" (coluna Q)
const COL_POSICAO   = 18  // "Posição" (coluna S)

// ---------------------------------------------------------------------------
// normalizeMotorista (D-10-06)
// ---------------------------------------------------------------------------

/**
 * Normaliza nome de motorista para o formato canônico de join com o ranking.
 * Ordem: trim → colapsa espaços internos → strip-acentos (NFD) → upper.
 * Produz a mesma forma que Driver.nome em ranking.types.ts.
 */
export function normalizeMotorista(nome: string): string {
  return nome
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

// ---------------------------------------------------------------------------
// Date parser (dd/MM/yyyy HH:mm:ss → Date, TZ America/Sao_Paulo = UTC-03)
// ---------------------------------------------------------------------------

const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/

/**
 * Parseia "dd/MM/yyyy HH:mm:ss" → Date.
 * America/Sao_Paulo = UTC-03 (offset fixo; Brasil aboliu DST em 2019).
 * Retorna null para strings inválidas (best-effort; linha será descartada).
 */
function parseDateSP(raw: string): Date | null {
  const m = DATE_RE.exec(raw.trim())
  if (!m) return null

  const [, dd, mm, yyyy, hh, mi, ss] = m
  // Constrói instante UTC aplicando offset -03:00
  const utcMs = Date.UTC(
    parseInt(yyyy, 10),
    parseInt(mm, 10) - 1,  // mês 0-indexed
    parseInt(dd, 10),
    parseInt(hh, 10) + 3,  // UTC = local + 03
    parseInt(mi, 10),
    parseInt(ss, 10),
  )
  if (isNaN(utcMs)) return null
  return new Date(utcMs)
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Parseia o buffer de um Viagens.xlsx e retorna somente as linhas com
 * Motorista não-vazio, normalizadas e com dataPosicao em UTC.
 *
 * @param buffer - Buffer da planilha (Buffer Node.js ou ArrayBuffer).
 * @returns Array de ParsedPosition (somente linhas com motorista).
 */
export function parseViagensXlsx(buffer: Buffer | ArrayBuffer): ParsedPosition[] {
  // T2: cellFormula:false — não avalia fórmulas; cellHTML:false — sem HTML
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false })

  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []

  // header:1 → array-of-arrays; raw:false → todos os valores como string;
  // defval:'' → células vazias viram string vazia (sem undefined/null surpresa)
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
  }) as string[][]

  const result: ParsedPosition[] = []

  // Começa em 1 (pula header na linha 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue

    const motorista = (row[COL_MOTORISTA] ?? '').trim()
    if (!motorista) continue  // D-10-05: só linhas com Motorista

    const dataRaw = (row[COL_DATA] ?? '').trim()
    const dataPosicao = parseDateSP(dataRaw)
    if (!dataPosicao) continue  // data inválida: descarta linha (best-effort)

    const posicaoRaw = (row[COL_POSICAO] ?? '').trim()
    const veiculoRaw = (row[COL_VEICULO] ?? '').trim()

    result.push({
      motorista,
      motoristaNorm: normalizeMotorista(motorista),
      dataPosicao,
      posicaoRaw,
      veiculo: veiculoRaw || null,
    })
  }

  return result
}
