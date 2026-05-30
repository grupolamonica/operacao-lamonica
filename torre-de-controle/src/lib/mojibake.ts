/**
 * fixMojibake — helper de display puro (PHASE8-MOJIBAKE-DISPLAY).
 *
 * O ride-rank guarda strings com encoding inconsistente (UTF-8 gravado e depois
 * lido como Latin-1 / Windows-1252). O Torre repassa os bytes intactos — esta
 * funcao normaliza as sequencias mojibake conhecidas APENAS na camada de view.
 * NAO altera o backend: e uma transformacao unidirecional somente-apresentacao
 * (D-V2-01 / 08-CONTEXT secao mojibake).
 *
 * Funcao pura: sem React, sem I/O, sem fetch. Idempotente e null/undefined-safe.
 *
 * Idempotencia + nao-corrupcao: cada par de origem comeca por Ã (U+00C3) ou pela
 * sequencia â€ (U+00E2 U+20AC). Letras acentuadas ja corretas (ã, ç, é, í ...)
 * sao um unico code point e nao contem essas sequencias de 2+ caracteres, entao
 * a tabela so casa mojibake e nunca corrompe texto valido (provado por testes).
 *
 * Destinos tipograficos usam escapes \u para evitar ambiguidade de chars curvos
 * no source; as origens mojibake sao literais UTF-8.
 *
 * @example fixMojibake('JoÃ£o') === 'João'
 */

/**
 * Pares [mojibake, correto] aplicados EM ORDEM (mais longo -> mais curto) para
 * evitar substituicao parcial (ex.: o em-dash de 3 chars antes do de 2 chars).
 */
const REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  // --- Pontuacao tipografica (sequencias mais longas primeiro) -------------
  // Forma cp1252 do em-dash do 08-CONTEXT linha 19: â + € + " (aspas reto ASCII;
  // o byte 0x94 do em-dash vira aspas-reto na 2a passagem). Casa ANTES de
  // qualquer par de 2 chars iniciado por "â€" para nao deixar o " reto orfao.
  ['â€"', '—'], // -> em-dash (Test 1 / Test 4)
  ['â€“', '–'], // en-dash
  ['â€œ', '“'], // aspas curvas de abertura
  ['â€™', '’'], // apostrofo tipografico
  ['â€˜', '‘'], // aspa simples de abertura
  // Par de 2 chars (â€) por ultimo: cobre o em-dash cp1252 sem o byte final.
  ['â€', '—'],
  // --- Acentos pt-BR maiusculos (Ã maiusculo) ------------------------------
  ['Ã‡', 'Ç'], // C-cedilha
  ['Ã‰', 'É'], // E-agudo
  ['Ã€', 'À'], // A-grave
  ['Ãƒ', 'Ã'], // A-til
  // --- Acentos pt-BR minusculos (Ã + segundo byte) -------------------------
  ['Ã£', 'ã'], // a-til
  ['Ã¡', 'á'], // a-agudo
  ['Ã¢', 'â'], // a-circunflexo
  ['Ã©', 'é'], // e-agudo
  ['Ãª', 'ê'], // e-circunflexo
  ['Ã­', 'í'], // i-agudo
  ['Ã³', 'ó'], // o-agudo
  ['Ã´', 'ô'], // o-circunflexo
  ['Ãº', 'ú'], // u-agudo
  ['Ã§', 'ç'], // c-cedilha
  ['Ã ', 'à'], // a-grave
  // --- A-circunflexo orfao (Â, U+00C2) antes de espaco/pontuacao -----------
  ['Â ', ' '], // Â + espaco -> espaco
  ['Â', ''], // Â residual isolado
]

/**
 * Normaliza mojibake de display conhecido para o caractere correto.
 * Retorna '' para null/undefined/'' e nunca lanca.
 */
export function fixMojibake(input: string | null | undefined): string {
  if (input == null || input === '') return ''
  let out = input
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from).join(to)
  }
  return out
}
