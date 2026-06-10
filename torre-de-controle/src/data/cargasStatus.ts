/**
 * Fix B1 — status operacional do Cargas (sheet_status).
 *
 * Lista canônica FIXA do requisito (10 status). O banco guarda o raw
 * UPPERCASE ('CTE EM EMISSÃO', ...); a UI mostra o label title-case.
 * Status fora da lista (ex.: 'NO SHOW') continuam filtráveis — a tabela
 * appenda dinamicamente os presentes no dado que não casem com a canônica.
 */
export interface CargasStatusOption {
  value: string   // raw do banco (UPPERCASE)
  label: string
}

export const CARGAS_STATUS_OPTIONS: CargasStatusOption[] = [
  { value: 'CANCELADO',                    label: 'Cancelado' },
  { value: 'EM ANDAMENTO',                 label: 'Em Andamento' },
  { value: 'AGUARDANDO CHEGAR NO CLIENTE', label: 'Aguardando Chegar no Cliente' },
  { value: 'CTE EM EMISSÃO',               label: 'CTE em Emissão' },
  { value: 'CTE ENVIADO',                  label: 'CTE Enviado' },
  { value: 'AGUARDANDO CARREGAMENTO',      label: 'Aguardando Carregamento' },
  { value: 'CARREGADO',                    label: 'Carregado' },
  { value: 'DESCARREGANDO',                label: 'Descarregando' },
  { value: 'DESCARREGADO',                 label: 'Descarregado' },
  { value: 'AGUARDANDO DESCARGA',          label: 'Aguardando Descarga' },
]

// Normaliza para comparação: UPPER + sem acento (NFD) + espaços colapsados.
const norm = (s: string) =>
  s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()

// Mojibake: '?' ou U+FFFD no lugar do caractere acentuado ('CTE EM EMISS?O').
const WILDCARD = new Set(['?', '\uFFFD'])

/**
 * Compara dois status tolerando o glitch de encoding: após normalizar,
 * '?'/U+FFFD casa com qualquer caractere na mesma posição.
 */
export function cargasStatusMatches(a: string, b: string): boolean {
  const na = norm(a)
  const nb = norm(b)
  if (na === nb) return true
  if (na.length !== nb.length) return false
  for (let i = 0; i < na.length; i++) {
    if (na[i] !== nb[i] && !WILDCARD.has(na[i]) && !WILDCARD.has(nb[i])) return false
  }
  return true
}

/** Label canônico para o raw do banco; raw fora da lista volta como veio. */
export function cargasStatusLabel(raw: string | null | undefined): string | null {
  if (!raw) return null
  return CARGAS_STATUS_OPTIONS.find(o => cargasStatusMatches(raw, o.value))?.label ?? raw
}
