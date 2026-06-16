/**
 * Fonte do Controle Operacional = a MESMA planilha do sistema de cargas.
 * Lê o CSV público (export?format=csv) — sem auth, pois a planilha é compartilhada
 * por link. O STATUS vem da coluna STATUS de lá (não derivamos da SPX), e o GR vem
 * das colunas CheckList Cavalo/Carreta (vigência Angellira).
 *
 * Estrutura (header na 3ª linha; as 2 primeiras são vazias):
 *   LH | TIPO | DATA CARREGAMENTO | DATA DESCARGA | Motoristas | CAVALO | CARRETA |
 *   VÍNCULO | Origem | Destino | EXTRA | STATUS | AGREGADO | CheckList Cavalo |
 *   CheckList Carreta1 | CheckList Carreta2 | Column 17 | DATA CARREGAMENTO2
 */

const SHEET_ID = process.env.OPERACIONAL_SHEET_ID || '1WKSbh4MMNAdCvqzWbicvpOefiYd8kR-sX2lY2qxYlaA'
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`

export interface SheetRow {
  lh: string
  tipo: string
  dataCarregamento: string
  dataDescarga: string
  motorista: string
  cavalo: string
  carreta: string
  vinculo: string
  origem: string
  destino: string
  status: string
  agregado: string
  checklistCavalo: string
  checklistCarreta1: string
  checklistCarreta2: string
}

/** Parser CSV (state machine) — trata aspas, vírgulas embutidas e CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field); field = ''
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (ch === '\r') {
      // ignora; o \n seguinte fecha a linha
    } else field += ch
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

const norm = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()

/** Acha o índice da coluna pelo nome, ignorando acento/caixa/espaços. */
function findCol(hdr: string[], target: string): number {
  const t = norm(target)
  return hdr.findIndex((h) => norm(h) === t)
}

/** Busca + parseia o CSV da planilha e devolve TODAS as linhas tipadas. */
export async function fetchCargasSheet(): Promise<SheetRow[]> {
  const res = await fetch(CSV_URL, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`planilha CSV HTTP ${res.status}`)
  const text = await res.text()
  const all = parseCsv(text)
  const hi = all.findIndex((r) => findCol(r, 'LH') >= 0 && findCol(r, 'STATUS') >= 0)
  if (hi < 0) throw new Error('header (LH/STATUS) não encontrado na planilha')
  const hdr = all[hi]
  const c = {
    lh: findCol(hdr, 'LH'),
    tipo: findCol(hdr, 'TIPO'),
    dataCarr: findCol(hdr, 'DATA CARREGAMENTO'),
    dataDesc: findCol(hdr, 'DATA DESCARGA'),
    mot: findCol(hdr, 'Motoristas'),
    cav: findCol(hdr, 'CAVALO'),
    car: findCol(hdr, 'CARRETA'),
    vin: findCol(hdr, 'VÍNCULO'),
    ori: findCol(hdr, 'Origem'),
    dest: findCol(hdr, 'Destino'),
    st: findCol(hdr, 'STATUS'),
    agr: findCol(hdr, 'AGREGADO'),
    ckCav: findCol(hdr, 'CheckList Cavalo'),
    ckCar1: findCol(hdr, 'CheckList Carreta1'),
    ckCar2: findCol(hdr, 'CheckList Carreta2'),
  }
  const out: SheetRow[] = []
  for (const r of all.slice(hi + 1)) {
    const g = (i: number) => (i >= 0 && i < r.length ? (r[i] || '').trim() : '')
    const lh = g(c.lh)
    if (!lh) continue
    out.push({
      lh,
      tipo: g(c.tipo),
      dataCarregamento: g(c.dataCarr),
      dataDescarga: g(c.dataDesc),
      motorista: g(c.mot),
      cavalo: g(c.cav),
      carreta: g(c.car),
      vinculo: g(c.vin),
      origem: g(c.ori),
      destino: g(c.dest),
      status: g(c.st),
      agregado: g(c.agr),
      checklistCavalo: g(c.ckCav),
      checklistCarreta1: g(c.ckCar1),
      checklistCarreta2: g(c.ckCar2),
    })
  }
  return out
}

/** 'DD/MM/YYYY HH:MM:SS' (ou sem zero à esquerda) → Date; null se inválida. */
export function parseBrDate(s: string): Date | null {
  const m = (s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  const d = +m[1], mo = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
  const dt = new Date(y, mo - 1, d)
  return isNaN(dt.getTime()) ? null : dt
}
