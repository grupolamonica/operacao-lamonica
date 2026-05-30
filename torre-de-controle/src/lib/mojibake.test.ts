/**
 * Testes do helper de display fixMojibake.
 *
 * Runner: o front nao tem suite (sem vitest). Este arquivo roda como script
 * de asserts via `npx --yes tsx torre-de-controle/src/lib/mojibake.test.ts`.
 * Os caracteres mojibake/esperados sao digitados concretamente (arquivo UTF-8).
 */
import assert from 'node:assert/strict'
import { fixMojibake } from './mojibake.ts'

// --- Casos concretos -------------------------------------------------------

// Test 1: sequencia mojibake exata da linha 19 do 08-CONTEXT (forma cp1252 do
// em-dash) deve virar um em-dash U+2014. A linha mostra `vinculo: "â€"`.
{
  const input = 'â€"'
  const out = fixMojibake(input)
  assert.equal(out, '—', 'Test 1: mojibake em-dash do CONTEXT -> U+2014')
  assert.equal(out, '—', 'Test 1: o caractere e exatamente U+2014')
}

// Test 2: nome pt-BR com mojibake de a-til (forma corrompida de "Joao da Silva"
// onde o "ã" virou "Ã£") deve virar "João da Silva" com a-til correto.
{
  const input = 'JoÃ£o da Silva'
  const out = fixMojibake(input)
  assert.equal(out, 'João da Silva', 'Test 2: a-til mojibake -> ã')
}

// Test 3: texto puramente ASCII passa inalterado.
{
  const input = 'Atraso na portaria'
  assert.equal(fixMojibake(input), 'Atraso na portaria', 'Test 3: ASCII inalterado')
}

// Test 4: idempotencia — aplicar 2x sobre o input do Test 1 nao corrompe.
{
  const once = fixMojibake('â€"')
  const twice = fixMojibake(once)
  assert.equal(twice, '—', 'Test 4: idempotente (em-dash estavel)')
  assert.equal(once, twice, 'Test 4: 2x == 1x')
}

// Test 5: null/undefined/'' -> '' e nunca lanca.
{
  assert.equal(fixMojibake(null as unknown as string), '', 'Test 5: null -> ""')
  assert.equal(fixMojibake(undefined as unknown as string), '', 'Test 5: undefined -> ""')
  assert.equal(fixMojibake(''), '', 'Test 5: "" -> ""')
}

// Test 6: NAO corromper acentos ja corretos. "Operação concluída" tem ç/ã/í
// validos e deve passar inalterado.
{
  const input = 'Operação concluída'
  assert.equal(fixMojibake(input), 'Operação concluída', 'Test 6: acentos validos intactos')
}

// Test 7 (extra): caso "Nao atribuido" mojibake comum -> "Não atribuído".
{
  const input = 'NÃ£o atribuÃ­do'
  assert.equal(fixMojibake(input), 'Não atribuído', 'Test 7: frase pt-BR mojibake')
}

console.log('mojibake.test.ts: all asserts passed')
